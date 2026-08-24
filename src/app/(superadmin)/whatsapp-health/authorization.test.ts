import { beforeEach, describe, expect, it, vi } from "vitest";

// The health console's actions touch a tenant's WhatsApp connection from
// outside the tenant. Every one of them is a POST endpoint to anyone holding
// a session, so the superadmin check has to be on the action itself.

let isSuperadmin = false;

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user-1", tenantId: "tenant-1", role: "admin", isSuperadmin },
        session: { impersonatedBy: null },
      }),
    },
  },
}));

const health = {
  clearAccountError: vi.fn(async () => true),
  getAccountOwner: vi.fn(async () => ({ id: "acc-1", tenantId: "tenant-9" })),
  listDeadWhatsappJobIdsForTenant: vi.fn(async () => ["job-1", "job-2"]),
};
vi.mock("@/modules/whatsapp/health", () => health);

const sync = { scheduleTemplateSync: vi.fn(async () => undefined) };
vi.mock("@/modules/whatsapp/sync-schedule", () => sync);

const queue = { requeueJob: vi.fn(async () => true) };
vi.mock("@/lib/queue/ops", () => queue);

vi.mock("@/modules/tenancy/audit", () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The system context the template sync runs as — real module otherwise, so
// requireSuperadminContext itself is the thing under test.
vi.mock("@/modules/tenancy/context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/tenancy/context")>()),
  buildSystemTenantContext: async (tenantId: string) => ({
    tenantId,
    userId: "system",
    role: "agent" as const,
    impersonatorUserId: null,
    accessStatus: "active" as const,
  }),
}));

const actions = await import("./actions");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  isSuperadmin = false;
});

describe("WhatsApp health actions", () => {
  const cases = [
    {
      name: "syncTemplatesAction",
      call: () => actions.syncTemplatesAction(form({ accountId: "acc-1" })),
      service: () => sync.scheduleTemplateSync,
    },
    {
      name: "clearAccountErrorAction",
      call: () => actions.clearAccountErrorAction(form({ accountId: "acc-1" })),
      service: () => health.clearAccountError,
    },
    {
      name: "retryTenantWhatsappJobsAction",
      call: () => actions.retryTenantWhatsappJobsAction(form({ tenantId: "tenant-9" })),
      service: () => queue.requeueJob,
    },
  ];

  for (const { name, call, service } of cases) {
    it(`refuses a tenant admin — ${name}`, async () => {
      await expect(call()).rejects.toThrow();
      expect(service()).not.toHaveBeenCalled();
    });

    it(`runs for a superadmin — ${name}`, async () => {
      isSuperadmin = true;
      await call();
      expect(service()).toHaveBeenCalled();
    });
  }

  it("requeues every dead job of the tenant, not just the first", async () => {
    isSuperadmin = true;
    await actions.retryTenantWhatsappJobsAction(form({ tenantId: "tenant-9" }));
    expect(queue.requeueJob).toHaveBeenCalledTimes(2);
  });
});
