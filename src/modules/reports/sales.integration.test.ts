import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The funnel, against a real database: a lead that became a deal that was
// won should be countable as exactly that, once, in the window it happened
// in — and not visible to any other business.
const hasDb = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!hasDb) return;
  const { db } = await import("@/db/client");
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
});

describe.skipIf(!hasDb)("sales report (MySQL integration)", () => {
  let reports: typeof import("./sales");
  let newId: (typeof import("@/lib/ids"))["newId"];

  type TenantContext = import("@/modules/tenancy/context").TenantContext;
  let ctx: TenantContext;
  let otherCtx: TenantContext;
  let wonStageId: string;

  beforeAll(async () => {
    reports = await import("./sales");
    ({ newId } = await import("@/lib/ids"));
    const { createTenant } = await import("@/modules/tenancy/tenants");
    const contacts = await import("@/modules/crm/contacts");
    const pipelines = await import("@/modules/crm/pipelines");
    const deals = await import("@/modules/crm/deals");

    const superadmin = { userId: "sa-reports", impersonatorUserId: null } as const;
    const tenant = await createTenant(superadmin, {
      name: `Reports ${newId()}`,
      slug: `reports-${newId()}`,
    });
    const other = await createTenant(superadmin, {
      name: `Other ${newId()}`,
      slug: `oreports-${newId()}`,
    });

    ctx = {
      tenantId: tenant!.id,
      userId: "rep-1",
      role: "admin",
      impersonatorUserId: null,
      accessStatus: "active",
    };
    otherCtx = { ...ctx, tenantId: other!.id };

    const pipeline = await pipelines.createPipelineWithDefaultStages(ctx, "Ventas");
    const stageRows = await pipelines.listStagesForPipeline(ctx, pipeline!.id);
    const open = stageRows.find((stage) => !stage.isWon && !stage.isLost)!;
    wonStageId = stageRows.find((stage) => stage.isWon)!.id;

    const contact = await contacts.createContact(ctx, {
      name: "Lead ganado",
      phone: `0985${Math.floor(Math.random() * 900000) + 100000}`,
    });
    const deal = await deals.createDeal(ctx, {
      contactId: contact!.id,
      pipelineId: pipeline!.id,
      stageId: open.id,
      title: "Obra",
      value: 5_000_000,
      assignedUserId: "rep-1",
    });
    // Moving it into the won stage is what closes it — the report reads
    // won/lost from the stage, never from a status column.
    await deals.moveDeal(ctx, deal!.id, { toStageId: wonStageId, toPosition: 0 });
  });

  it("counts the deal it created, in the window, once", async () => {
    const report = await reports.getSalesReport(ctx, reports.reportWindow(30));

    expect(report.funnel.contactsCreated).toBe(1);
    expect(report.funnel.dealsOpened).toBe(1);
    expect(report.funnel.dealsWon).toBe(1);
    expect(report.funnel.dealsLost).toBe(0);
    expect(report.funnel.wonValue).toBe(5_000_000);
  });

  it("attributes it to the rep who owns it", async () => {
    const report = await reports.getSalesReport(ctx, reports.reportWindow(30));
    const rep = report.byAgent.find((row) => row.userId === "rep-1");

    expect(rep).toBeDefined();
    expect(rep!.dealsWon).toBe(1);
    expect(rep!.wonValue).toBe(5_000_000);
  });

  it("shows another business none of it", async () => {
    const report = await reports.getSalesReport(otherCtx, reports.reportWindow(30));

    expect(report.funnel.dealsWon).toBe(0);
    expect(report.funnel.wonValue).toBe(0);
    expect(report.byAgent).toEqual([]);
  });

  it("drops out of a window that ended before any of it happened", async () => {
    const past = {
      from: new Date("2020-01-01T00:00:00Z"),
      to: new Date("2020-02-01T00:00:00Z"),
      days: 31,
    };
    const report = await reports.getSalesReport(ctx, past);

    expect(report.funnel.dealsOpened).toBe(0);
    expect(report.funnel.dealsWon).toBe(0);
    expect(report.byMonth).toEqual([]);
  });
});
