import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The two guarantees deletion.ts makes that only a real database can show:
// the guard refuses while history exists, and a permitted delete takes the
// record's own rows with it and nothing else. Same harness as the other
// integration suites (MySQL, no parallel files).
const hasDb = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!hasDb) return;
  const { db } = await import("@/db/client");
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
});

describe.skipIf(!hasDb)("deleting contacts and deals (MySQL integration)", () => {
  let newId: (typeof import("@/lib/ids"))["newId"];
  let deletion: typeof import("./deletion");
  let contacts: typeof import("./contacts");
  let deals: typeof import("./deals");
  let tasks: typeof import("./tasks");
  let pipelines: typeof import("./pipelines");
  let quotes: typeof import("@/modules/quotes/quotes");

  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  let ctx: TenantContext;
  let otherCtx: TenantContext;
  let pipelineId: string;
  let stageId: string;

  beforeAll(async () => {
    ({ newId } = await import("@/lib/ids"));
    deletion = await import("./deletion");
    contacts = await import("./contacts");
    deals = await import("./deals");
    tasks = await import("./tasks");
    pipelines = await import("./pipelines");
    quotes = await import("@/modules/quotes/quotes");
    const { createTenant } = await import("@/modules/tenancy/tenants");

    const superadmin = { userId: "sa-del", impersonatorUserId: null } as const;
    const tenant = await createTenant(superadmin, {
      name: `Del ${newId()}`,
      slug: `del-${newId()}`,
    });
    const other = await createTenant(superadmin, {
      name: `Other ${newId()}`,
      slug: `odl-${newId()}`,
    });

    ctx = {
      tenantId: tenant!.id,
      userId: "system",
      role: "admin",
      impersonatorUserId: null,
      accessStatus: "active",
      currency: "SEK",
    };
    otherCtx = { ...ctx, tenantId: other!.id };

    const pipeline = await pipelines.createPipelineWithDefaultStages(ctx, "Försäljning");
    pipelineId = pipeline!.id;
    const stages = await pipelines.listStagesForPipeline(ctx, pipelineId);
    stageId = stages.find((stage) => !stage.isWon && !stage.isLost)!.id;
  });

  function tomorrow() {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  function phone() {
    return `0981${Math.floor(Math.random() * 900000) + 100000}`;
  }

  async function newContact(name: string) {
    const contact = await contacts.createContact(ctx, { name, phone: phone() });
    return contact!.id;
  }

  async function newDeal(contactId: string, title: string) {
    const deal = await deals.createDeal(ctx, { contactId, pipelineId, stageId, title });
    return deal!.id;
  }

  describe("contacts", () => {
    it("deletes one with no history, and its own rows with it", async () => {
      const contactId = await newContact("Borrable");
      const tag = await contacts.createTag(ctx, { name: `t-${newId()}` });
      await contacts.addTagToContact(ctx, contactId, tag!.id);
      await tasks.createTask(ctx, { contactId, title: "Llamar", dueAt: tomorrow() });

      expect(await deletion.findContactDeleteBlockers(ctx, contactId)).toEqual([]);
      await deletion.deleteContactRecord(ctx, contactId);

      expect(await contacts.getContact(ctx, contactId)).toBeNull();
      expect(await contacts.listTagsForContact(ctx, contactId)).toEqual([]);
      expect(await tasks.listTasksForContact(ctx, contactId)).toEqual([]);
    });

    it("refuses one that has a deal, and leaves it intact", async () => {
      const contactId = await newContact("Con negocio");
      await newDeal(contactId, "Obra");

      expect(await deletion.findContactDeleteBlockers(ctx, contactId)).toContain("deals");
      await expect(deletion.deleteContactRecord(ctx, contactId)).rejects.toMatchObject({
        code: "hasHistory",
        blockers: ["deals"],
      });
      expect(await contacts.getContact(ctx, contactId)).not.toBeNull();
    });

    it("refuses one that has a quote", async () => {
      const contactId = await newContact("Con presupuesto");
      await quotes.createQuote(ctx, {
        contactId,
        items: [{ description: "Servicio", qty: 1, unitPrice: 500_000 }],
      });

      expect(await deletion.findContactDeleteBlockers(ctx, contactId)).toEqual(["quotes"]);
      await expect(deletion.deleteContactRecord(ctx, contactId)).rejects.toMatchObject({
        code: "hasHistory",
      });
    });

    it("is invisible to another tenant", async () => {
      const contactId = await newContact("Ajeno");

      await expect(deletion.deleteContactRecord(otherCtx, contactId)).rejects.toMatchObject({
        code: "notFound",
      });
      expect(await contacts.getContact(ctx, contactId)).not.toBeNull();
    });
  });

  describe("deals", () => {
    it("deletes one with nothing attached, and leaves the contact alone", async () => {
      const contactId = await newContact("Dueño del negocio");
      const dealId = await newDeal(contactId, "Presupuestar");
      await tasks.createTask(ctx, { contactId, dealId, title: "Visitar obra", dueAt: tomorrow() });
      await tasks.createTask(ctx, { contactId, title: "Tarea del contacto", dueAt: tomorrow() });

      expect(await deletion.findDealDeleteBlockers(ctx, dealId)).toEqual([]);
      await deletion.deleteDealRecord(ctx, dealId);

      expect(await deals.getDeal(ctx, dealId)).toBeNull();
      expect(await contacts.getContact(ctx, contactId)).not.toBeNull();
      // The contact's own task survives; only the deal's went with the deal.
      const remaining = await tasks.listTasksForContact(ctx, contactId);
      expect(remaining.map((task) => task.title)).toEqual(["Tarea del contacto"]);
    });

    it("refuses one that has a quote", async () => {
      const contactId = await newContact("Negocio con presupuesto");
      const dealId = await newDeal(contactId, "Con presupuesto");
      await quotes.createQuote(ctx, {
        contactId,
        dealId,
        items: [{ description: "Servicio", qty: 1, unitPrice: 500_000 }],
      });

      expect(await deletion.findDealDeleteBlockers(ctx, dealId)).toEqual(["quotes"]);
      await expect(deletion.deleteDealRecord(ctx, dealId)).rejects.toMatchObject({
        code: "hasHistory",
        blockers: ["quotes"],
      });
      expect(await deals.getDeal(ctx, dealId)).not.toBeNull();
    });
  });
});
