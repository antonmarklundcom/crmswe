import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Deactivation, role changes and their guards (PLAN.md §13 H4). Real MySQL
// only, same pattern as isolation.test.ts — the behavior under test *is* the
// database state (a ban that doesn't drop the session rows isn't a ban).
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("tenant user lifecycle", () => {
  let db: (typeof import("@/db/client"))["db"];
  let schema: typeof import("@/db/schema");
  let newId: (typeof import("@/lib/ids"))["newId"];
  let users: typeof import("./users");
  let createTenant: (typeof import("./tenants"))["createTenant"];

  type TenantContext = import("./context").TenantContext;
  const superadmin: import("./context").SuperadminContext = {
    userId: "sa-lifecycle",
    impersonatorUserId: null,
  };

  let tenantId: string;
  let adminCtx: TenantContext;
  let agentId: string;
  let secondAdminId: string;

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    schema = await import("@/db/schema");
    ({ newId } = await import("@/lib/ids"));
    users = await import("./users");
    ({ createTenant } = await import("./tenants"));

    const tenant = await createTenant(superadmin, { name: `Lifecycle ${newId()}`, slug: `lc-${newId()}` });
    tenantId = tenant!.id;

    const admin = await users.createTenantAdminUser({
      tenantId,
      email: `admin-${newId()}@example.com`,
      password: "password-1234",
      name: "Admin",
    });
    const agent = await users.createTenantAdminUser({
      tenantId,
      email: `agent-${newId()}@example.com`,
      password: "password-1234",
      name: "Agent",
      role: "agent",
    });
    const second = await users.createTenantAdminUser({
      tenantId,
      email: `admin2-${newId()}@example.com`,
      password: "password-1234",
      name: "Admin dos",
    });

    agentId = agent!.id;
    secondAdminId = second!.id;
    adminCtx = {
      tenantId,
      userId: admin!.id,
      role: "admin",
      impersonatorUserId: null,
      accessStatus: "active",
    };
  });

  afterAll(async () => {
    if (!db) return;
    const pool = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
    await pool.end();
  });

  it("kills a deactivated user's live session on the next request", async () => {
    const sessionId = newId();
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: agentId,
      token: `tok-${sessionId}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    expect(await users.getActiveTenantUser(agentId, tenantId)).not.toBeNull();

    await users.setTenantUserBanned(adminCtx, agentId, true, "salió del equipo");

    // Both halves matter: the cookie they hold is now backed by nothing, and
    // even a forged one resolves to no context.
    const rows = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, agentId));
    expect(rows).toEqual([]);
    expect(await users.getActiveTenantUser(agentId, tenantId)).toBeNull();
  });

  it("reactivates a user", async () => {
    await users.setTenantUserBanned(adminCtx, agentId, false);
    expect(await users.getActiveTenantUser(agentId, tenantId)).not.toBeNull();
  });

  it("refuses to act on a user from another tenant, or on yourself", async () => {
    const other = await createTenant(superadmin, { name: `Other ${newId()}`, slug: `ot-${newId()}` });
    const stranger = await users.createTenantAdminUser({
      tenantId: other!.id,
      email: `stranger-${newId()}@example.com`,
      password: "password-1234",
      name: "Stranger",
    });

    await expect(users.setTenantUserBanned(adminCtx, stranger!.id, true)).rejects.toThrow(
      "notFound",
    );
    await expect(users.setTenantUserBanned(adminCtx, adminCtx.userId, true)).rejects.toThrow(
      "self",
    );
  });

  it("changes a role, but never leaves the tenant without an admin", async () => {
    await users.setTenantUserRole(adminCtx, agentId, "admin");
    const [promoted] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, agentId));
    expect(promoted.role).toBe("admin");

    // Three admins now; demoting two of them is fine, and the guard only
    // bites when the last active one is the target.
    await users.setTenantUserRole(adminCtx, agentId, "agent");
    await users.setTenantUserRole(adminCtx, secondAdminId, "agent");

    const soloCtx: TenantContext = { ...adminCtx, userId: agentId, role: "agent" };
    await expect(
      users.setTenantUserRole(soloCtx, adminCtx.userId, "agent"),
    ).rejects.toThrow("lastAdmin");
  });
});
