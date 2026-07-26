import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Lead ingest (PLAN.md §5.1) + the cross-tenant isolation merge gate (§3.3
// layer 3) for the tables 1E adds. Real MySQL only, same convention as the
// other isolation suites.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("lead ingest + sites isolation", () => {
  let db: (typeof import("@/db/client"))["db"];
  let schema: typeof import("@/db/schema");
  let newId: (typeof import("@/lib/ids"))["newId"];
  let createTenant: (typeof import("@/modules/tenancy/tenants"))["createTenant"];
  let buildSystemTenantContext: (typeof import("@/modules/tenancy/context"))["buildSystemTenantContext"];
  let seedDefaultPipeline: (typeof import("@/modules/crm/pipelines"))["seedDefaultPipeline"];
  let listStagesForPipeline: (typeof import("@/modules/crm/pipelines"))["listStagesForPipeline"];
  let createSite: (typeof import("./sites"))["createSite"];
  let listSites: (typeof import("./sites"))["listSites"];
  let rotateApiKey: (typeof import("./sites"))["rotateApiKey"];
  let updateSite: (typeof import("./sites"))["updateSite"];
  let ingestLead: (typeof import("./ingest"))["ingestLead"];
  let listContacts: (typeof import("@/modules/crm/contacts"))["listContacts"];
  let listDealsForPipeline: (typeof import("@/modules/crm/deals"))["listDealsForPipeline"];

  type TenantContext = import("@/modules/tenancy/context").TenantContext;
  const superadmin = { userId: "sa-test", impersonatorUserId: null } as const;

  let ctxA: TenantContext;
  let ctxB: TenantContext;
  let keyA: string;
  let keyB: string;
  let siteAId: string;
  let stageAId: string;
  let pipelineAId: string;

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    schema = await import("@/db/schema");
    ({ newId } = await import("@/lib/ids"));
    ({ createTenant } = await import("@/modules/tenancy/tenants"));
    ({ buildSystemTenantContext } = await import("@/modules/tenancy/context"));
    ({ seedDefaultPipeline, listStagesForPipeline } = await import("@/modules/crm/pipelines"));
    ({ createSite, listSites, rotateApiKey, updateSite } = await import("./sites"));
    ({ ingestLead } = await import("./ingest"));
    ({ listContacts } = await import("@/modules/crm/contacts"));
    ({ listDealsForPipeline } = await import("@/modules/crm/deals"));

    const tenantA = await createTenant(superadmin, {
      name: "Ingest Tenant A",
      slug: `ingest-a-${newId()}`,
    });
    const tenantB = await createTenant(superadmin, {
      name: "Ingest Tenant B",
      slug: `ingest-b-${newId()}`,
    });
    ctxA = (await buildSystemTenantContext(tenantA!.id))!;
    ctxB = (await buildSystemTenantContext(tenantB!.id))!;

    const pipelineA = await seedDefaultPipeline(ctxA);
    pipelineAId = pipelineA!.id;
    const stagesA = await listStagesForPipeline(ctxA, pipelineAId);
    stageAId = stagesA[0].id;

    const siteA = await createSite(ctxA, {
      name: "Dentista",
      slug: `dentista-${newId()}`,
      domain: "dentista.com.py",
      defaultPipelineId: pipelineAId,
      defaultStageId: stageAId,
    });
    siteAId = siteA.id;
    keyA = siteA.apiKey;

    const siteB = await createSite(ctxB, { name: "Otra", slug: `otra-${newId()}` });
    keyB = siteB.apiKey;
  });

  afterAll(async () => {
    if (!db) return;
    const pool = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
    await pool.end();
  });

  function body(overrides: Record<string, unknown> = {}) {
    return {
      phone: `0981${Math.floor(100000 + Math.random() * 899999)}`,
      name: "Cliente Test",
      idempotency_key: `idem-${newId()}`,
      ...overrides,
    };
  }

  it("rejects a missing or invalid API key without touching data", async () => {
    expect(await ingestLead(null, body())).toMatchObject({ ok: false, status: 401 });
    expect(await ingestLead("vc_live_nonsense", body())).toMatchObject({ ok: false, status: 401 });
    // A well-formed key from a different scheme is still rejected.
    expect(await ingestLead("not-even-prefixed", body())).toMatchObject({ ok: false, status: 401 });
  });

  it("creates a contact + deal in the site's configured stage and stamps first-touch UTMs", async () => {
    const phone = `0981${Math.floor(100000 + Math.random() * 899999)}`;
    const outcome = await ingestLead(
      keyA,
      body({
        phone,
        utm_source: "google",
        utm_campaign: "verano",
        page_url: "https://dentista.com.py/implantes",
      }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.dealId).toBeTruthy();

    const [contact] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, outcome.result.contactId));
    // Paraguayan local format normalised to E.164 (§5).
    expect(contact.phone.startsWith("+595")).toBe(true);
    expect(contact.firstSiteId).toBe(siteAId);
    expect((contact.firstTouchUtm as { campaign?: string }).campaign).toBe("verano");

    const deals = await listDealsForPipeline(ctxA, pipelineAId);
    expect(deals.some((d) => d.id === outcome.result.dealId && d.stageId === stageAId)).toBe(true);
  });

  it("is idempotent: replaying the same idempotency_key returns the original lead", async () => {
    const payload = body({ utm_campaign: "retry-test" });

    const first = await ingestLead(keyA, payload);
    const second = await ingestLead(keyA, payload);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.result.duplicate).toBe(true);
    expect(second.result.contactId).toBe(first.result.contactId);
    expect(second.result.submissionId).toBe(first.result.submissionId);

    const rows = await db
      .select()
      .from(schema.leadSubmissions)
      .where(eq(schema.leadSubmissions.idempotencyKey, payload.idempotency_key as string));
    expect(rows).toHaveLength(1);
  });

  it("first-touch attribution is not overwritten when the same contact returns via another campaign", async () => {
    const phone = `0981${Math.floor(100000 + Math.random() * 899999)}`;

    const first = await ingestLead(keyA, body({ phone, utm_campaign: "primera" }));
    await ingestLead(keyA, body({ phone, utm_campaign: "segunda" }));

    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const [contact] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, first.result.contactId));
    expect((contact.firstTouchUtm as { campaign?: string }).campaign).toBe("primera");

    // …but the second submission keeps its own last-touch value.
    const subs = await db
      .select()
      .from(schema.leadSubmissions)
      .where(eq(schema.leadSubmissions.contactId, first.result.contactId));
    const campaigns = subs.map((s) => (s.utm as { campaign?: string }).campaign);
    expect(campaigns).toContain("segunda");
  });

  it("a leaked key can only write into its own tenant — tenant B's key never lands in tenant A", async () => {
    const outcome = await ingestLead(keyB, body({ name: "Lead de B" }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const contactsA = await listContacts(ctxA);
    expect(contactsA.some((c) => c.id === outcome.result.contactId)).toBe(false);

    const contactsB = await listContacts(ctxB);
    expect(contactsB.some((c) => c.id === outcome.result.contactId)).toBe(true);
  });

  it("sites are isolated per tenant", async () => {
    const sitesA = await listSites(ctxA);
    const sitesB = await listSites(ctxB);
    expect(sitesA.some((s) => s.id === siteAId)).toBe(true);
    expect(sitesB.some((s) => s.id === siteAId)).toBe(false);
  });

  it("rotating a key invalidates the old one immediately", async () => {
    const site = await createSite(ctxA, { name: "Rotar", slug: `rotar-${newId()}` });
    const rotated = await rotateApiKey(ctxA, site.id);

    expect(await ingestLead(site.apiKey, body())).toMatchObject({ ok: false, status: 401 });
    expect((await ingestLead(rotated, body())).ok).toBe(true);
  });

  it("an inactive site is refused with 403", async () => {
    const site = await createSite(ctxA, { name: "Pausado", slug: `pausado-${newId()}` });
    await updateSite(ctxA, site.id, { isActive: false });

    expect(await ingestLead(site.apiKey, body())).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects an invalid body with 422 rather than creating a partial lead", async () => {
    const outcome = await ingestLead(keyA, { name: "Sin teléfono", idempotency_key: "x".repeat(10) });
    expect(outcome).toMatchObject({ ok: false, status: 422 });
  });
});
