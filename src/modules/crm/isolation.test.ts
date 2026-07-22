import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Cross-tenant isolation for the CRM tables added in 1C (PLAN.md §3.3 layer
// 3: "a merge gate for every later sub-phase that adds tables"). Runs only
// against a real MySQL (CI provides one as a service container) — skipped
// locally without DATABASE_URL, same as modules/tenancy/isolation.test.ts.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("crm isolation", () => {
  let db: (typeof import("@/db/client"))["db"];
  let newId: (typeof import("@/lib/ids"))["newId"];
  let createTenant: (typeof import("@/modules/tenancy/tenants"))["createTenant"];
  let buildSystemTenantContext: (typeof import("@/modules/tenancy/context"))["buildSystemTenantContext"];
  let createContact: (typeof import("./contacts"))["createContact"];
  let listContacts: (typeof import("./contacts"))["listContacts"];
  let createTag: (typeof import("./contacts"))["createTag"];
  let addTagToContact: (typeof import("./contacts"))["addTagToContact"];
  let listTagsForContact: (typeof import("./contacts"))["listTagsForContact"];
  let seedDefaultPipeline: (typeof import("./pipelines"))["seedDefaultPipeline"];
  let listStagesForPipeline: (typeof import("./pipelines"))["listStagesForPipeline"];
  let createDeal: (typeof import("./deals"))["createDeal"];
  let moveDeal: (typeof import("./deals"))["moveDeal"];
  let listActivitiesForContact: (typeof import("./activities"))["listActivitiesForContact"];

  type TenantContext = import("@/modules/tenancy/context").TenantContext;
  const superadmin = { userId: "sa-test", impersonatorUserId: null } as const;

  let ctxA: TenantContext;
  let ctxB: TenantContext;

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    ({ newId } = await import("@/lib/ids"));
    ({ createTenant } = await import("@/modules/tenancy/tenants"));
    ({ buildSystemTenantContext } = await import("@/modules/tenancy/context"));
    ({ createContact, listContacts, createTag, addTagToContact, listTagsForContact } =
      await import("./contacts"));
    ({ seedDefaultPipeline, listStagesForPipeline } = await import("./pipelines"));
    ({ createDeal, moveDeal } = await import("./deals"));
    ({ listActivitiesForContact } = await import("./activities"));

    const tenantA = await createTenant(superadmin, {
      name: "CRM Tenant A",
      slug: `crm-tenant-a-${newId()}`,
    });
    const tenantB = await createTenant(superadmin, {
      name: "CRM Tenant B",
      slug: `crm-tenant-b-${newId()}`,
    });

    const built1 = await buildSystemTenantContext(tenantA!.id);
    const built2 = await buildSystemTenantContext(tenantB!.id);
    ctxA = built1!;
    ctxB = built2!;
  });

  afterAll(async () => {
    if (!db) return;
    const pool = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
    await pool.end();
  });

  it("contacts are isolated per tenant, even with the same phone number", async () => {
    const phone = `+595981${newId().slice(0, 6)}`;
    const contactA = await createContact(ctxA, { name: "Contact A", phone });
    const contactB = await createContact(ctxB, { name: "Contact B", phone });

    expect(contactA!.id).not.toBe(contactB!.id);

    const listA = await listContacts(ctxA);
    const listB = await listContacts(ctxB);
    expect(listA.some((c) => c.id === contactB!.id)).toBe(false);
    expect(listB.some((c) => c.id === contactA!.id)).toBe(false);
  });

  it("tags and contact-tag links never cross tenants", async () => {
    const contactA = await createContact(ctxA, {
      name: "Tag Test A",
      phone: `+595982${newId().slice(0, 6)}`,
    });
    const tagB = await createTag(ctxB, { name: `only-b-${newId()}` });

    // ctxA operating on ctxB's tag id: the link gets tenant-stamped to A,
    // but listTagsForContact(ctxA, ...) only ever cross-references tags
    // already scoped to A, so B's tag never surfaces for A's contact.
    await addTagToContact(ctxA, contactA!.id, tagB!.id);
    const tagsForA = await listTagsForContact(ctxA, contactA!.id);
    expect(tagsForA.some((t) => t.id === tagB!.id)).toBe(false);
  });

  it("moving a deal into another tenant's stage id fails instead of leaking across tenants", async () => {
    const pipelineA = await seedDefaultPipeline(ctxA);
    const pipelineB = await seedDefaultPipeline(ctxB);
    const stagesA = await listStagesForPipeline(ctxA, pipelineA!.id);
    const stagesB = await listStagesForPipeline(ctxB, pipelineB!.id);

    const contactA = await createContact(ctxA, {
      name: "Deal Contact A",
      phone: `+595983${newId().slice(0, 6)}`,
    });
    const deal = await createDeal(ctxA, {
      contactId: contactA!.id,
      pipelineId: pipelineA!.id,
      stageId: stagesA[0].id,
      title: "Cross-tenant move attempt",
    });

    await expect(
      moveDeal(ctxA, deal!.id, { toStageId: stagesB[0].id, toPosition: 0 }),
    ).rejects.toThrow(/not found/);

    // The stage-change activity is only ever written for a successful move —
    // no activity row leaks out of a rejected cross-tenant attempt.
    const activities = await listActivitiesForContact(ctxA, contactA!.id);
    expect(activities.some((a) => a.type === "stage_change")).toBe(false);
  });
});
