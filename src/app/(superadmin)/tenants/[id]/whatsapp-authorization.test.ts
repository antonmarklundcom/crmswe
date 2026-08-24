import { beforeEach, describe, expect, it, vi } from "vitest";

// The tenant detail page's WhatsApp actions act on a tenant's connection
// from outside it — every one of them is a POST endpoint reachable by anyone
// holding a session, so the superadmin check has to be on the action itself
// (§3.2: never gate on `role` alone). Same shape as
// whatsapp-health/authorization.test.ts.

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

const accounts = {
  connectAccountManually: vi.fn(async () => ({ id: "acc-new" })),
  disconnectAccount: vi.fn(async () => ({ id: "acc-1" })),
};
vi.mock("@/modules/whatsapp/accounts", () => accounts);

vi.mock("@/modules/tenancy/audit", () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Real module otherwise, so requireSuperadminContext itself is under test —
// only the tenant-context build is stubbed, exactly as the health suite
// stubs it for its own system-context calls.
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

const actionsModule = await import("./actions");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  isSuperadmin = false;
});

describe("tenant WhatsApp actions", () => {
  it("refuses a tenant admin — connectTenantWhatsappAction", async () => {
    await expect(
      actionsModule.connectTenantWhatsappAction(
        { error: null, field: null, values: {} },
        form({
          tenantId: "tenant-9",
          wabaId: "waba-1",
          phoneNumberId: "phone-1",
          accessToken: "secret-token",
        }),
      ),
    ).rejects.toThrow();
    expect(accounts.connectAccountManually).not.toHaveBeenCalled();
  });

  it("connects for a superadmin, on the named tenant, without echoing the token", async () => {
    isSuperadmin = true;
    const result = await actionsModule.connectTenantWhatsappAction(
      { error: null, field: null, values: {} },
      form({
        tenantId: "tenant-9",
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        accessToken: "secret-token",
      }),
    );

    expect(accounts.connectAccountManually).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-9" }),
      expect.objectContaining({ wabaId: "waba-1", phoneNumberId: "phone-1" }),
    );
    expect(result.error).toBeNull();
    expect(JSON.stringify(result.values)).not.toContain("secret-token");
  });

  it("refuses a tenant admin — disconnectTenantWhatsappAction", async () => {
    await expect(
      actionsModule.disconnectTenantWhatsappAction(
        form({ tenantId: "tenant-9", accountId: "acc-1" }),
      ),
    ).rejects.toThrow();
    expect(accounts.disconnectAccount).not.toHaveBeenCalled();
  });

  it("disconnects for a superadmin, on the named tenant and account", async () => {
    isSuperadmin = true;
    await actionsModule.disconnectTenantWhatsappAction(
      form({ tenantId: "tenant-9", accountId: "acc-1" }),
    );
    expect(accounts.disconnectAccount).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-9" }),
      "acc-1",
    );
  });
});
