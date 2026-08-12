import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Inbound webhook lane (PLAN.md §5.2). Real MySQL only, same convention as
// the other module suites — the whole point of this lane is what it writes,
// so a mocked database would test nothing.
//
// The payloads below are the shapes these builders actually send: Elementor
// Pro's Webhook action, Wix Automations' form-submitted payload, a Zapier
// "Webhooks by Zapier" POST, and a generic flat form builder.
const hasDb = !!process.env.DATABASE_URL;

const ELEMENTOR_PAYLOAD = {
  form: { id: "a1b2c3", name: "Formulario de contacto" },
  fields: {
    nombre: { id: "nombre", type: "text", title: "Nombre", value: "Ana Giménez" },
    telefono: { id: "telefono", type: "tel", title: "Teléfono", value: "0981 123-456" },
    email: { id: "email", type: "email", title: "Correo", value: "ana@example.com" },
    mensaje: { id: "mensaje", type: "textarea", title: "Mensaje", value: "Quiero un presupuesto" },
  },
  meta: {
    page_url: { title: "Page URL", value: "https://cliente.com.py/contacto" },
    remote_ip: { title: "Remote IP", value: "181.120.0.1" },
  },
};

const WIX_PAYLOAD = {
  data: {
    formName: "Contacto",
    submissions: [
      { label: "Nombre", fieldName: "first_name", fieldValue: "Carlos Ruiz" },
      { label: "Teléfono", fieldName: "phone", fieldValue: "+595981222333" },
      { label: "Correo", fieldName: "email", fieldValue: "carlos@example.com" },
    ],
    submissionTime: "2026-08-12T10:00:00Z",
  },
};

const ZAPIER_PAYLOAD = {
  event: "form.submission",
  payload: {
    contact: { full_name: "Marta López", phone_number: "0971 555 444" },
    answers: [
      { question: "¿Qué necesitás?", answer: "Instalación eléctrica" },
      { question: "¿Cuándo?", answer: "Esta semana" },
    ],
  },
};

const GENERIC_FORM_PAYLOAD = {
  name: "Pedro Benítez",
  phone: "0985 777 888",
  email: "pedro@example.com",
  message: "Consulta por precios",
};

describe.skipIf(!hasDb)("webhook ingest lane", () => {
  let db: (typeof import("@/db/client"))["db"];
  let schema: typeof import("@/db/schema");
  let newId: (typeof import("@/lib/ids"))["newId"];
  let createTenant: (typeof import("@/modules/tenancy/tenants"))["createTenant"];
  let buildSystemTenantContext: (typeof import("@/modules/tenancy/context"))["buildSystemTenantContext"];
  let seedDefaultPipeline: (typeof import("@/modules/crm/pipelines"))["seedDefaultPipeline"];
  let listStagesForPipeline: (typeof import("@/modules/crm/pipelines"))["listStagesForPipeline"];
  let createSite: (typeof import("./sites"))["createSite"];
  let hooks: typeof import("./hooks");
  let listContacts: (typeof import("@/modules/crm/contacts"))["listContacts"];
  let listDealsForPipeline: (typeof import("@/modules/crm/deals"))["listDealsForPipeline"];

  type TenantContext = import("@/modules/tenancy/context").TenantContext;
  const superadmin = { userId: "sa-test", impersonatorUserId: null } as const;

  let ctxA: TenantContext;
  let ctxB: TenantContext;
  let pipelineAId: string;
  let stageAId: string;

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    schema = await import("@/db/schema");
    ({ newId } = await import("@/lib/ids"));
    ({ createTenant } = await import("@/modules/tenancy/tenants"));
    ({ buildSystemTenantContext } = await import("@/modules/tenancy/context"));
    ({ seedDefaultPipeline, listStagesForPipeline } = await import("@/modules/crm/pipelines"));
    ({ createSite } = await import("./sites"));
    hooks = await import("./hooks");
    ({ listContacts } = await import("@/modules/crm/contacts"));
    ({ listDealsForPipeline } = await import("@/modules/crm/deals"));

    const tenantA = await createTenant(superadmin, {
      name: "Hook Tenant A",
      slug: `hook-a-${newId()}`,
    });
    const tenantB = await createTenant(superadmin, {
      name: "Hook Tenant B",
      slug: `hook-b-${newId()}`,
    });
    ctxA = (await buildSystemTenantContext(tenantA!.id))!;
    ctxB = (await buildSystemTenantContext(tenantB!.id))!;

    const pipelineA = await seedDefaultPipeline(ctxA);
    pipelineAId = pipelineA!.id;
    stageAId = (await listStagesForPipeline(ctxA, pipelineAId))[0].id;
  });

  afterAll(async () => {
    if (!db) return;
    const pool = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
    await pool.end();
  });

  /** A site with a webhook token and, optionally, a mapping. */
  async function makeSite(
    mapping?: import("./hooks").SiteHookMapping,
    ctx: TenantContext = ctxA,
    routed = true,
  ) {
    const site = await createSite(ctx, {
      name: "Cliente Elementor",
      slug: `cliente-${newId()}`,
      defaultPipelineId: routed && ctx === ctxA ? pipelineAId : undefined,
      defaultStageId: routed && ctx === ctxA ? stageAId : undefined,
    });
    const token = await hooks.issueHookToken(ctx, site.id);
    if (mapping) await hooks.setSiteHookMapping(ctx, site.id, mapping);
    return { siteId: site.id, token };
  }

  it("rejects an unknown or malformed token as 404, giving nothing away", async () => {
    expect(await hooks.receiveHookPayload(null, {})).toMatchObject({ status: 404 });
    expect(await hooks.receiveHookPayload("vc_hook_nonsense", {})).toMatchObject({ status: 404 });
    expect(await hooks.receiveHookPayload("not-even-prefixed", {})).toMatchObject({ status: 404 });
  });

  it("captures raw payloads while a site has no mapping, and writes nothing", async () => {
    const { siteId, token } = await makeSite();

    const outcome = await hooks.receiveHookPayload(token, ELEMENTOR_PAYLOAD);
    expect(outcome).toMatchObject({ ok: false, status: 202, captured: true });

    const captures = await hooks.listHookCaptures(ctxA, siteId);
    expect(captures).toHaveLength(1);
    expect((captures[0].payload as typeof ELEMENTOR_PAYLOAD).fields.telefono.value).toBe(
      "0981 123-456",
    );

    // Capture mode is not ingest: no contact, no submission.
    const subs = await db
      .select()
      .from(schema.leadSubmissions)
      .where(eq(schema.leadSubmissions.siteId, siteId));
    expect(subs).toHaveLength(0);

    // And the paths offered to the admin are the ones the mapping will use.
    const paths = hooks.captureLeafPaths(captures[0]).map((leaf) => leaf.path);
    expect(paths).toContain("fields.telefono.value");
    expect(paths).toContain("fields.nombre.value");
  });

  it("keeps only the newest N captures", async () => {
    const { siteId, token } = await makeSite();
    for (let i = 0; i < hooks.MAX_CAPTURES_PER_SITE + 3; i += 1) {
      await hooks.receiveHookPayload(token, { intento: i });
    }
    const captures = await hooks.listHookCaptures(ctxA, siteId);
    expect(captures).toHaveLength(hooks.MAX_CAPTURES_PER_SITE);
  });

  it("maps an Elementor Pro payload into a contact and a deal in the site's stage", async () => {
    const { siteId, token } = await makeSite({
      phone: "fields.telefono.value",
      name: "fields.nombre.value",
      email: "fields.email.value",
      message: "fields.mensaje.value",
    });

    const outcome = await hooks.receiveHookPayload(token, ELEMENTOR_PAYLOAD);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const [contact] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, outcome.result.result.contactId));
    expect(contact.name).toBe("Ana Giménez");
    expect(contact.email).toBe("ana@example.com");
    // Paraguayan local format, spaces and dashes and all, normalized to E.164.
    expect(contact.phone).toBe("+595981123456");

    // Per-site routing still comes from the CRM, never the payload (§5.1).
    const deals = await listDealsForPipeline(ctxA, pipelineAId);
    expect(
      deals.some((d) => d.id === outcome.result.result.dealId && d.stageId === stageAId),
    ).toBe(true);

    // Nothing is lost: the whole payload is on the submission.
    const [submission] = await db
      .select()
      .from(schema.leadSubmissions)
      .where(eq(schema.leadSubmissions.siteId, siteId));
    expect((submission.payload as typeof ELEMENTOR_PAYLOAD).meta.page_url.value).toBe(
      "https://cliente.com.py/contacto",
    );
    expect(submission.notes).toBe("Quiero un presupuesto");
  });

  it("maps a Wix Automations payload addressed by array index", async () => {
    const { token } = await makeSite({
      phone: "data.submissions[1].fieldValue",
      name: "data.submissions[0].fieldValue",
      email: "data.submissions[2].fieldValue",
    });

    const outcome = await hooks.receiveHookPayload(token, WIX_PAYLOAD);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const [contact] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, outcome.result.result.contactId));
    expect(contact.name).toBe("Carlos Ruiz");
    expect(contact.phone).toBe("+595981222333");
  });

  it("maps a Zapier payload with a nested contact object and an answers array", async () => {
    const { token } = await makeSite({
      phone: "payload.contact.phone_number",
      name: "payload.contact.full_name",
      message: "payload.answers[0].answer",
    });

    const outcome = await hooks.receiveHookPayload(token, ZAPIER_PAYLOAD);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const [contact] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, outcome.result.result.contactId));
    expect(contact.name).toBe("Marta López");
    expect(contact.phone).toBe("+595971555444");
  });

  it("maps a flat generic form-builder payload", async () => {
    const { token } = await makeSite({
      phone: "phone",
      name: "name",
      email: "email",
      message: "message",
    });

    const outcome = await hooks.receiveHookPayload(token, GENERIC_FORM_PAYLOAD);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const [contact] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, outcome.result.result.contactId));
    expect(contact.name).toBe("Pedro Benítez");
  });

  it("answers 422 when the mapped phone path finds nothing, without writing a partial lead", async () => {
    const { siteId, token } = await makeSite({ phone: "fields.no_existe.value" });

    expect(await hooks.receiveHookPayload(token, ELEMENTOR_PAYLOAD)).toMatchObject({
      ok: false,
      status: 422,
    });

    const subs = await db
      .select()
      .from(schema.leadSubmissions)
      .where(eq(schema.leadSubmissions.siteId, siteId));
    expect(subs).toHaveLength(0);
  });

  it("collapses a resubmitted form into one lead via the derived idempotency key", async () => {
    const { siteId, token } = await makeSite({ phone: "phone", name: "name" });

    const first = await hooks.receiveHookPayload(token, GENERIC_FORM_PAYLOAD);
    const second = await hooks.receiveHookPayload(token, GENERIC_FORM_PAYLOAD);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.result.result.duplicate).toBe(true);
    expect(second.result.result.submissionId).toBe(first.result.result.submissionId);

    const subs = await db
      .select()
      .from(schema.leadSubmissions)
      .where(eq(schema.leadSubmissions.siteId, siteId));
    expect(subs).toHaveLength(1);
  });

  it("derives the same key for the same phone written differently, and a new one next bucket", () => {
    const now = 1_800_000_000_000;
    const a = hooks.deriveIdempotencyKey("site1", "0981 123-456", now);
    const b = hooks.deriveIdempotencyKey("site1", "0981123456", now);
    expect(a).toBe(b);

    // Different site, same phone and bucket → different key: one client's
    // submissions can never dedupe against another's.
    expect(hooks.deriveIdempotencyKey("site2", "0981123456", now)).not.toBe(a);

    // Next bucket → a genuinely new enquiry lands as its own lead.
    expect(
      hooks.deriveIdempotencyKey("site1", "0981123456", now + hooks.IDEMPOTENCY_BUCKET_MS),
    ).not.toBe(a);
  });

  it("refuses an inactive site with 403", async () => {
    const { siteId, token } = await makeSite({ phone: "phone" });
    const { updateSite } = await import("./sites");
    await updateSite(ctxA, siteId, { isActive: false });

    expect(await hooks.receiveHookPayload(token, GENERIC_FORM_PAYLOAD)).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("stops accepting a revoked token while the site's API keys keep working", async () => {
    const site = await createSite(ctxA, { name: "Revocar", slug: `revocar-${newId()}` });
    const token = await hooks.issueHookToken(ctxA, site.id);
    await hooks.setSiteHookMapping(ctxA, site.id, { phone: "phone" });

    expect((await hooks.receiveHookPayload(token, GENERIC_FORM_PAYLOAD)).ok).toBe(true);

    await hooks.revokeHookToken(ctxA, site.id);
    expect(await hooks.receiveHookPayload(token, GENERIC_FORM_PAYLOAD)).toMatchObject({
      status: 404,
    });

    // The two credentials are independent: revoking the webhook must not
    // touch the keyed lane the owner's own sites run on.
    const { ingestLead } = await import("./ingest");
    const replay = await ingestLead(site.apiKey, {
      phone: "0981999888",
      idempotency_key: `idem-${newId()}`,
    });
    expect(replay.ok).toBe(true);
  });

  it("is rate limited more tightly than the keyed lane", async () => {
    const { token } = await makeSite({ phone: "phone" }, ctxA, false);

    let limited = false;
    for (let i = 0; i < 40 && !limited; i += 1) {
      const outcome = await hooks.receiveHookPayload(token, {
        phone: `098100${String(i).padStart(4, "0")}`,
      });
      limited = !outcome.ok && outcome.status === 429;
    }
    expect(limited).toBe(true);
  });

  it("keeps tenants apart: a webhook lead lands only in its own tenant", async () => {
    const { token } = await makeSite({ phone: "phone", name: "name" }, ctxB);

    const outcome = await hooks.receiveHookPayload(token, GENERIC_FORM_PAYLOAD);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const contactId = outcome.result.result.contactId;
    expect((await listContacts(ctxA)).some((c) => c.id === contactId)).toBe(false);
    expect((await listContacts(ctxB)).some((c) => c.id === contactId)).toBe(true);
  });
});
