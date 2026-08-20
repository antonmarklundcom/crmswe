import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The exit criteria for PLAN.md §13 H6: a 1k-row file with mixed duplicates
// and errors imports with a correct report, and the seat limit blocks the
// N+1th invite. Both are database behavior, so this suite needs a real
// MySQL — same skip pattern as the other integration suites.
const hasDb = !!process.env.DATABASE_URL;

// One pool for the file, closed once: both suites below import the same
// db client module, so closing it per-suite would leave the second one
// talking to a shut connection.
afterAll(async () => {
  if (!hasDb) return;
  const { db } = await import("@/db/client");
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
});

describe.skipIf(!hasDb)("contact import (MySQL integration)", () => {
  let newId: (typeof import("@/lib/ids"))["newId"];
  let importContacts: (typeof import("./import"))["importContacts"];
  let queryContacts: (typeof import("./contact-list"))["queryContacts"];
  let createContact: (typeof import("./contacts"))["createContact"];
  let createTenant: (typeof import("@/modules/tenancy/tenants"))["createTenant"];

  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  let ctx: TenantContext;

  beforeAll(async () => {
    ({ newId } = await import("@/lib/ids"));
    ({ importContacts } = await import("./import"));
    ({ queryContacts } = await import("./contact-list"));
    ({ createContact } = await import("./contacts"));
    ({ createTenant } = await import("@/modules/tenancy/tenants"));

    const tenant = await createTenant(
      { userId: "sa-import", impersonatorUserId: null },
      { name: `Import ${newId()}`, slug: `imp-${newId()}` },
    );

    ctx = {
      tenantId: tenant!.id,
      userId: "system",
      role: "admin",
      impersonatorUserId: null,
      accessStatus: "active",
    };
  });

  // A thousand rows through real MySQL is the point of this test, and it
  // does not fit vitest's 5s default on a loaded CI runner — it timed out
  // there while passing locally. The bound still has to exist (a hung import
  // must fail, not hang the job), so it is stated rather than inherited.
  it("imports a 1k-row file with mixed duplicates and errors, and reports it correctly", { timeout: 60_000 }, async () => {
    // One contact already exists, so the file's copy of it is an update.
    await createContact(ctx, { name: "Existing", phone: "0981000001" });

    const rows: Record<string, string>[] = [];
    for (let i = 1; i <= 1000; i += 1) {
      rows.push({
        nombre: `Contacto ${i}`,
        telefono: `098100${String(i).padStart(4, "0")}`,
        correo: `contacto${i}@example.com`,
      });
    }
    // Deliberate damage, on top of the 1000 good rows:
    rows.push({ nombre: "Sin teléfono", telefono: "", correo: "x@example.com" });
    rows.push({ nombre: "", telefono: "0981999999", correo: "y@example.com" });
    rows.push({ nombre: "Repetida", telefono: "0981000500", correo: "z@example.com" });
    rows.push({ nombre: "Basura", telefono: "n/a", correo: "" });

    const report = await importContacts(ctx, rows, {
      mapping: { name: "nombre", phone: "telefono", email: "correo" },
      onDuplicate: "update",
    });

    expect(report.total).toBe(1004);
    expect(report.created).toBe(999); // 1000 minus the one that already existed
    expect(report.updated).toBe(1);
    expect(report.skipped).toBe(0);

    const reasons = report.errors.map((e) => e.reason).sort();
    expect(reasons).toEqual(["duplicateInFile", "nameMissing", "phoneInvalid", "phoneMissing"]);

    // Row numbers are 1-based *as the user sees them*, header included.
    const missingPhone = report.errors.find((e) => e.reason === "phoneMissing");
    expect(missingPhone?.row).toBe(1002);

    const page = await queryContacts(ctx, {}, { page: 1, perPage: 1 });
    expect(page.total).toBe(1000);
  });

  it("skips duplicates instead of updating them when asked", async () => {
    const phone = `09817${String(Math.floor(Math.random() * 90000) + 10000)}`;
    await createContact(ctx, { name: "Original", phone });

    const report = await importContacts(
      ctx,
      [{ n: "Cambiado", p: phone }],
      { mapping: { name: "n", phone: "p" }, onDuplicate: "skip" },
    );

    expect(report.skipped).toBe(1);
    expect(report.updated).toBe(0);
    expect(report.created).toBe(0);
  });
});

describe.skipIf(!hasDb)("plan limits (MySQL integration)", () => {
  let db: (typeof import("@/db/client"))["db"];
  let schema: typeof import("@/db/schema");
  let newId: (typeof import("@/lib/ids"))["newId"];
  let checkPlanLimit: (typeof import("@/modules/tenancy/limits"))["checkPlanLimit"];
  let createTenant: (typeof import("@/modules/tenancy/tenants"))["createTenant"];
  let createPlan: (typeof import("@/modules/tenancy/plans"))["createPlan"];
  let createSubscription: (typeof import("@/modules/tenancy/subscriptions"))["createSubscription"];
  let createTenantAdminUser: (typeof import("@/modules/tenancy/users"))["createTenantAdminUser"];

  const superadmin = { userId: "sa-limits", impersonatorUserId: null } as const;
  let tenantId: string;

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    schema = await import("@/db/schema");
    ({ newId } = await import("@/lib/ids"));
    ({ checkPlanLimit } = await import("@/modules/tenancy/limits"));
    ({ createTenant } = await import("@/modules/tenancy/tenants"));
    ({ createPlan } = await import("@/modules/tenancy/plans"));
    ({ createSubscription } = await import("@/modules/tenancy/subscriptions"));
    ({ createTenantAdminUser } = await import("@/modules/tenancy/users"));

    const tenant = await createTenant(superadmin, {
      name: `Limits ${newId()}`,
      slug: `lim-${newId()}`,
    });
    tenantId = tenant!.id;

    // A two-seat plan: the tenant may hold two active users, no more.
    const plan = await createPlan(superadmin, {
      name: `Two seats ${newId()}`,
      durationMonths: 3,
      price: 100000,
      limits: { maxUsers: 2 },
    });
    await createSubscription(superadmin, { tenantId, planId: plan!.id });
  });

  it("blocks the seat after the plan's last one, and frees it on deactivation", async () => {
    const first = await createTenantAdminUser({
      tenantId,
      email: `a-${newId()}@example.com`,
      password: "password-1234",
      name: "A",
    });
    expect((await checkPlanLimit(tenantId, "maxUsers")).allowed).toBe(true);

    await createTenantAdminUser({
      tenantId,
      email: `b-${newId()}@example.com`,
      password: "password-1234",
      name: "B",
      role: "agent",
    });

    // Two seats used: the third invite is the one that must be refused.
    const full = await checkPlanLimit(tenantId, "maxUsers");
    expect(full.allowed).toBe(false);
    expect(full.limit).toBe(2);
    expect(full.current).toBe(2);

    // Deactivating someone returns their seat (§13 H4 is what makes this the
    // answer to "we're full"), and the check has to see that immediately.
    const { eq } = await import("drizzle-orm");
    await db.update(schema.users).set({ banned: true }).where(eq(schema.users.id, first!.id));
    expect((await checkPlanLimit(tenantId, "maxUsers")).allowed).toBe(true);
  });

  it("treats a plan with no limits as unlimited", async () => {
    const other = await createTenant(superadmin, {
      name: `Unlimited ${newId()}`,
      slug: `unl-${newId()}`,
    });
    const check = await checkPlanLimit(other!.id, "maxContacts", 10_000);
    expect(check).toEqual({ allowed: true, limit: null, current: 0 });
  });
});
