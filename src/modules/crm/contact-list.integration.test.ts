import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The pipeline/stage filter on the contacts list: "who is sitting in
// "Förhandling" right now" is the question a rep asks before a follow-up round,
// and it has to answer from deals rather than from the contact row.
const hasDb = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!hasDb) return;
  const { db } = await import("@/db/client");
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
});

describe.skipIf(!hasDb)("filtering contacts by pipeline and stage (MySQL integration)", () => {
  let newId: (typeof import("@/lib/ids"))["newId"];
  let contactList: typeof import("./contact-list");
  let contacts: typeof import("./contacts");
  let deals: typeof import("./deals");
  let pipelines: typeof import("./pipelines");

  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  let ctx: TenantContext;
  let salesPipelineId: string;
  let obrasId: string;
  let openStageId: string;
  let laterStageId: string;
  let obrasStageId: string;

  // One contact per lane, created once: name is what the assertions read.
  let inFirstStage: string;
  let inLaterStage: string;
  let inOtherPipeline: string;
  let withNoDeal: string;

  beforeAll(async () => {
    ({ newId } = await import("@/lib/ids"));
    contactList = await import("./contact-list");
    contacts = await import("./contacts");
    deals = await import("./deals");
    pipelines = await import("./pipelines");
    const { createTenant } = await import("@/modules/tenancy/tenants");

    const superadmin = { userId: "sa-list", impersonatorUserId: null } as const;
    const tenant = await createTenant(superadmin, {
      name: `List ${newId()}`,
      slug: `list-${newId()}`,
    });

    ctx = {
      tenantId: tenant!.id,
      userId: "system",
      role: "admin",
      impersonatorUserId: null,
      accessStatus: "active",
      currency: "SEK",
    };

    const forsaljning = await pipelines.createPipelineWithDefaultStages(ctx, "Försäljning");
    salesPipelineId = forsaljning!.id;
    const salesStages = (await pipelines.listStagesForPipeline(ctx, salesPipelineId)).filter(
      (stage) => !stage.isWon && !stage.isLost,
    );
    openStageId = salesStages[0].id;
    laterStageId = salesStages[1].id;

    const obras = await pipelines.createPipelineWithDefaultStages(ctx, "Obras");
    obrasId = obras!.id;
    obrasStageId = (await pipelines.listStagesForPipeline(ctx, obrasId)).find(
      (stage) => !stage.isWon && !stage.isLost,
    )!.id;

    async function contactWithDeal(name: string, pipelineId: string, stageId: string) {
      const contact = await contacts.createContact(ctx, {
        name,
        phone: `0981${Math.floor(Math.random() * 900000) + 100000}`,
      });
      await deals.createDeal(ctx, { contactId: contact!.id, pipelineId, stageId, title: name });
      return contact!.id;
    }

    inFirstStage = await contactWithDeal(`Primera ${newId()}`, salesPipelineId, openStageId);
    inLaterStage = await contactWithDeal(`Segunda ${newId()}`, salesPipelineId, laterStageId);
    inOtherPipeline = await contactWithDeal(`Obra ${newId()}`, obrasId, obrasStageId);
    withNoDeal = (await contacts.createContact(ctx, {
      name: `Sin negocio ${newId()}`,
      phone: `0982${Math.floor(Math.random() * 900000) + 100000}`,
    }))!.id;
  });

  async function idsMatching(query: Parameters<typeof contactList.queryContacts>[1]) {
    const page = await contactList.queryContacts(ctx, query, { perPage: 100 });
    return page.rows.map((row) => row.id);
  }

  it("returns only contacts with a deal in the chosen pipeline", async () => {
    const ids = await idsMatching({ pipelineId: salesPipelineId });
    expect(ids).toContain(inFirstStage);
    expect(ids).toContain(inLaterStage);
    expect(ids).not.toContain(inOtherPipeline);
    expect(ids).not.toContain(withNoDeal);
  });

  it("narrows to one stage when a stage is chosen", async () => {
    const ids = await idsMatching({ stageId: laterStageId });
    expect(ids).toEqual([inLaterStage]);
  });

  it("lets the stage win over the pipeline when both are set", async () => {
    // The two selects are independent, so a leftover pipeline value must not
    // widen the answer back out to the whole pipeline.
    const ids = await idsMatching({ pipelineId: obrasId, stageId: openStageId });
    expect(ids).toEqual([inFirstStage]);
  });

  it("composes with the other filters rather than replacing them", async () => {
    const [contact] = await contacts.listContacts(ctx, { search: "Primera" });
    const ids = await idsMatching({ pipelineId: salesPipelineId, search: contact.name });
    expect(ids).toEqual([inFirstStage]);
  });
});
