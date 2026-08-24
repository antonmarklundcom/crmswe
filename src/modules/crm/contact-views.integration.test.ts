import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Saved views are shared inside the business and private to it — the two
// things only a real database shows. Same harness as the other integration
// suites (MySQL, no parallel files).
const hasDb = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!hasDb) return;
  const { db } = await import("@/db/client");
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
});

describe.skipIf(!hasDb)("saved contact views (MySQL integration)", () => {
  let newId: (typeof import("@/lib/ids"))["newId"];
  let views: typeof import("./contact-views");

  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  let adminCtx: TenantContext;
  let agentCtx: TenantContext;
  let otherCtx: TenantContext;

  beforeAll(async () => {
    ({ newId } = await import("@/lib/ids"));
    views = await import("./contact-views");
    const { createTenant } = await import("@/modules/tenancy/tenants");

    const superadmin = { userId: "sa-views", impersonatorUserId: null } as const;
    const tenant = await createTenant(superadmin, {
      name: `Views ${newId()}`,
      slug: `views-${newId()}`,
    });
    const other = await createTenant(superadmin, {
      name: `Other ${newId()}`,
      slug: `oviews-${newId()}`,
    });

    adminCtx = {
      tenantId: tenant!.id,
      userId: "admin-user",
      role: "admin",
      impersonatorUserId: null,
      accessStatus: "active",
    };
    agentCtx = { ...adminCtx, userId: "agent-user", role: "agent" };
    otherCtx = { ...adminCtx, tenantId: other!.id };
  });

  it("saves a view and shows it to everyone in the business", async () => {
    const name = `Sin responsable ${newId()}`;
    await views.createContactView(agentCtx, { name, query: "ownerUserId=&openDeal=1" });

    const forAdmin = await views.listContactViews(adminCtx);
    expect(forAdmin.map((view) => view.name)).toContain(name);
  });

  it("never leaks a view to another business", async () => {
    const name = `Solo nuestra ${newId()}`;
    await views.createContactView(adminCtx, { name, query: "source=web" });

    const elsewhere = await views.listContactViews(otherCtx);
    expect(elsewhere.map((view) => view.name)).not.toContain(name);
  });

  it("refuses a second view under the same name", async () => {
    const name = `Repetida ${newId()}`;
    await views.createContactView(adminCtx, { name, query: "source=web" });

    await expect(
      views.createContactView(adminCtx, { name, query: "source=whatsapp" }),
    ).rejects.toBeInstanceOf(views.ContactViewNameTakenError);
  });

  it("lets an agent delete their own view but not somebody else's", async () => {
    const mine = await views.createContactView(agentCtx, {
      name: `Mía ${newId()}`,
      query: "sort=name&dir=asc",
    });
    const theirs = await views.createContactView(adminCtx, {
      name: `Ajena ${newId()}`,
      query: "sort=phone&dir=asc",
    });

    await expect(views.deleteContactView(agentCtx, theirs!.id)).rejects.toThrow();
    await views.deleteContactView(agentCtx, mine!.id);

    const remaining = (await views.listContactViews(adminCtx)).map((view) => view.id);
    expect(remaining).not.toContain(mine!.id);
    expect(remaining).toContain(theirs!.id);
  });

  it("lets an admin delete a view somebody else saved", async () => {
    const view = await views.createContactView(agentCtx, {
      name: `Del agente ${newId()}`,
      query: "openDeal=1",
    });

    await views.deleteContactView(adminCtx, view!.id);
    expect((await views.listContactViews(adminCtx)).map((v) => v.id)).not.toContain(view!.id);
  });
});
