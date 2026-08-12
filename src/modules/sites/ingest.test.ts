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
  let updateSite: (typeof import("./sites"))["updateSite"];
  let issueApiKey: (typeof import("./keys"))["issueApiKey"];
  let revokeApiKey: (typeof import("./keys"))["revokeApiKey"];
  let listApiKeys: (typeof import("./keys"))["listApiKeys"];
  let listActiveApiKeys: (typeof import("./keys"))["listActiveApiKeys"];
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
    ({ createSite, listSites, updateSite } = await import("./sites"));
    ({ issueApiKey, revokeApiKey, listApiKeys, listActiveApiKeys } = await import("./keys"));
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

  // Two-active-key rotation (PLAN.md §5.2). The old single-key model made
  // these two assertions impossible at once: issuing a key used to kill the
  // previous one on the spot, so every site was down for the window between
  // "issued" and "deployed".
  it("keeps both keys live through a rotation, then kills only the revoked one", async () => {
    const site = await createSite(ctxA, { name: "Rotar", slug: `rotar-${newId()}` });
    const issued = await issueApiKey(ctxA, site.id, "clave nueva");
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    // Mid-rotation: the site is still deployed with the old key, the new one
    // is already accepted. Neither request fails.
    expect((await ingestLead(site.apiKey, body())).ok).toBe(true);
    expect((await ingestLead(issued.plaintext, body())).ok).toBe(true);

    const active = await listActiveApiKeys(ctxA, site.id);
    expect(active).toHaveLength(2);

    // Revoke the original once the new key is live on the site.
    const original = active.find((key) => key.id !== issued.keyId)!;
    await revokeApiKey(ctxA, site.id, original.id);

    expect(await ingestLead(site.apiKey, body())).toMatchObject({ ok: false, status: 401 });
    expect((await ingestLead(issued.plaintext, body())).ok).toBe(true);
  });

  it("refuses a third live key", async () => {
    const site = await createSite(ctxA, { name: "Tres", slug: `tres-${newId()}` });
    expect((await issueApiKey(ctxA, site.id)).ok).toBe(true);
    expect(await issueApiKey(ctxA, site.id)).toMatchObject({ ok: false, error: "tooManyKeys" });

    // …and revoking one frees the slot again.
    const active = await listActiveApiKeys(ctxA, site.id);
    await revokeApiKey(ctxA, site.id, active[0].id);
    expect((await issueApiKey(ctxA, site.id)).ok).toBe(true);
  });

  it("records last-used-at per key, which is what makes revoking the old one safe", async () => {
    const site = await createSite(ctxA, { name: "Uso", slug: `uso-${newId()}` });
    const issued = await issueApiKey(ctxA, site.id, "nueva");
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    // Only the new key posts. The UI reads exactly this to prove the site
    // has cut over before the old key is turned off.
    expect((await ingestLead(issued.plaintext, body())).ok).toBe(true);

    const keys = await listApiKeys(ctxA, site.id);
    const fresh = keys.find((key) => key.id === issued.keyId)!;
    const original = keys.find((key) => key.id !== issued.keyId)!;
    expect(fresh.lastUsedAt).toBeTruthy();
    expect(original.lastUsedAt).toBeNull();
  });

  it("keys are isolated per tenant — tenant B cannot list or revoke tenant A's", async () => {
    const keysFromB = await listApiKeys(ctxB, siteAId);
    expect(keysFromB).toHaveLength(0);

    const [liveKeyA] = await listActiveApiKeys(ctxA, siteAId);
    await revokeApiKey(ctxB, siteAId, liveKeyA.id);
    // The write was scoped to tenant B, so tenant A's key is untouched and
    // still works.
    expect((await ingestLead(keyA, body())).ok).toBe(true);
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

  // Per-site ingest health (PLAN.md §5.2) on the keyed lane. The failure it
  // is built for is exactly this one: the site's handler starts posting a
  // broken body, the CRM answers 422, and nothing in the pipeline says so.
  it("records health for the keyed lane, and keeps the payload out of it", async () => {
    const { getSiteHealth, siteHealthStatus } = await import("./health");
    const site = await createSite(ctxA, {
      name: "Salud",
      slug: `salud-${newId()}`,
      defaultPipelineId: pipelineAId,
      defaultStageId: stageAId,
    });

    expect((await ingestLead(site.apiKey, body())).ok).toBe(true);
    let health = await getSiteHealth(ctxA, site.id);
    expect(siteHealthStatus(health)).toBe("ok");
    expect(health!.lastSuccessLane).toBe("key");

    await ingestLead(site.apiKey, { nombre: "sin teléfono", idempotency_key: "y".repeat(10) });
    health = await getSiteHealth(ctxA, site.id);
    expect(siteHealthStatus(health)).toBe("failing");
    expect(health!.lastErrorStatus).toBe(422);
    expect(health!.errorCount).toBe(1);
    expect(health!.successCount).toBe(1);
    expect(JSON.stringify(health)).not.toContain(site.apiKey);
  });
});
