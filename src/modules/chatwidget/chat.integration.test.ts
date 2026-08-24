import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// What the widget promises end to end (docs/SPEC-CHAT-WIDGET.md §8): the
// three modes behave differently, the caps bite and answer 200 anyway, a
// WhatsApp reply counts against a chat one, capture creates a contact exactly
// once, and none of it crosses a tenant boundary (PLAN.md §3.3 layer 3).
const hasDb = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!hasDb) return;
  const { db } = await import("@/db/client");
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
});

describe.skipIf(!hasDb)("chat widget (MySQL integration)", () => {
  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  let newId: (typeof import("@/lib/ids"))["newId"];
  let widgetsModule: typeof import("./widgets");
  let publicModule: typeof import("./public");
  let conversationsModule: typeof import("./conversations");
  let repliesModule: typeof import("@/modules/ai/replies");

  let ctx: TenantContext;
  let elsewhere: TenantContext;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Stands in for the provider's HTTP endpoint — a fresh Response per call,
   * since a body can only be read once. */
  function stubProvider(text = "Claro, te cuento.") {
    return vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            model: "gpt-4o-mini",
            choices: [{ message: { content: text } }],
            usage: { prompt_tokens: 80, completion_tokens: 15 },
          }),
          { status: 200 },
        ),
    );
  }

  async function setTenantAi(mode: "draft" | "send", enabled = true) {
    const { updateTenantAiSettings } = await import("@/modules/tenancy/settings");
    await updateTenantAiSettings(ctx, { enabled, mode });
  }

  async function makeWidget(
    overrides: Partial<Parameters<typeof widgetsModule.createChatWidget>[1]> = {},
  ) {
    const site = await (await import("@/modules/sites/sites")).createSite(ctx, {
      name: `Site ${newId()}`,
      slug: `s-${newId().toLowerCase()}`,
    });
    return widgetsModule.createChatWidget(ctx, {
      siteId: site.id,
      name: "Asistente",
      mode: "send",
      ...overrides,
    });
  }

  beforeAll(async () => {
    ({ newId } = await import("@/lib/ids"));
    widgetsModule = await import("./widgets");
    publicModule = await import("./public");
    conversationsModule = await import("./conversations");
    repliesModule = await import("@/modules/ai/replies");

    const { createTenant } = await import("@/modules/tenancy/tenants");
    const superadmin = { userId: "sa-chat", impersonatorUserId: null } as const;

    const tenant = await createTenant(superadmin, {
      name: `Chat ${newId()}`,
      slug: `chat-${newId().toLowerCase()}`,
    });
    const other = await createTenant(superadmin, {
      name: `Other ${newId()}`,
      slug: `ochat-${newId().toLowerCase()}`,
    });

    ctx = {
      tenantId: tenant!.id,
      userId: "admin-user",
      role: "admin",
      impersonatorUserId: null,
      accessStatus: "active",
    };
    elsewhere = { ...ctx, tenantId: other!.id };

  });

  it("sends live when both the tenant and the widget are autonomous", async () => {
    await setTenantAi("send");
    const widget = await makeWidget({ mode: "send" });
    stubProvider("Trabajamos de 8 a 17.");

    const outcome = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId: newId(),
      body: "¿A qué hora abren?",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.pendingHuman).toBe(false);
    expect(outcome.data.messages.map((message) => message.author)).toEqual(["visitor", "ai"]);
    expect(outcome.data.messages[1].body).toBe("Trabajamos de 8 a 17.");
  });

  it("drafts — and shows the visitor nothing — while the tenant is on draft", async () => {
    // The ceiling from §10 1O, reused verbatim: an autonomous widget under a
    // draft-mode tenant still drafts. Going live stays a two-key operation.
    await setTenantAi("draft");
    const widget = await makeWidget({ mode: "send" });
    stubProvider("Un precio inventado");

    const outcome = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId: newId(),
      body: "¿Cuánto sale?",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.pendingHuman).toBe(true);
    // The draft body must never reach the visitor — a draft is for the rep.
    expect(outcome.data.messages.map((message) => message.author)).toEqual(["visitor"]);

    const { listPendingChatDrafts } = await import("./drafts");
    const drafts = await listPendingChatDrafts(ctx, outcome.data.conversationId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].body).toBe("Un precio inventado");
    expect(drafts[0].channel).toBe("chat");
  });

  it("spends nothing at all when the widget is off", async () => {
    await setTenantAi("send");
    const widget = await makeWidget({ mode: "off" });
    const fetchSpy = stubProvider();

    const outcome = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId: newId(),
      body: "Hola",
    });

    expect(outcome.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("counts a WhatsApp reply against the chat's own tenant budget", async () => {
    // The reason ai_replies carries a channel instead of the widget getting
    // its own table: one tenant, one daily budget.
    await setTenantAi("send");
    const { updateTenantAiSettings } = await import("@/modules/tenancy/settings");
    await updateTenantAiSettings(ctx, { enabled: true, mode: "send", maxRepliesPerTenantPerDay: 1 });

    // A WhatsApp row spends the whole allowance.
    await repliesModule.recordReply(ctx, {
      channel: "whatsapp",
      conversationId: newId(),
      contactId: newId(),
      mode: "send",
      status: "sent",
      prompt: "whatsapp",
    });

    const widget = await makeWidget({ mode: "send" });
    const fetchSpy = stubProvider();

    const outcome = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId: newId(),
      body: "Hola",
    });

    // Capped — and answered 200 with the "a person is coming" shape, because
    // the tenant's billing state is never their customer's business.
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.pendingHuman).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    await updateTenantAiSettings(ctx, { enabled: true, mode: "send" });
  });

  it("silences the AI on the handoff keyword and stays silent after", async () => {
    await setTenantAi("send");
    const widget = await makeWidget({ mode: "send" });
    const visitorId = newId();
    stubProvider();

    await publicModule.postVisitorMessage(widget!.widgetKey, { visitorId, body: "Hola" });
    await publicModule.postVisitorMessage(widget!.widgetKey, { visitorId, body: "humano" });

    const fetchSpy = stubProvider();
    const after = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId,
      body: "¿Seguís ahí?",
    });

    expect(after.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("turns a visitor into a contact exactly once", async () => {
    await setTenantAi("send");
    const widget = await makeWidget({ mode: "send", captureAfterMessages: 1 });
    const visitorId = newId();
    stubProvider();

    const first = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId,
      body: "Necesito un presupuesto",
    });
    expect(first.ok && first.data.askForContact).toBe(true);

    const phone = `+59598${Math.floor(1000000 + Math.random() * 8999999)}`;
    const captured = await publicModule.postCapture(widget!.widgetKey, {
      visitorId,
      name: "Ana",
      phone,
    });
    expect(captured.ok).toBe(true);

    // Capturing twice is a normal thing for a visitor correcting a typo, and
    // must not open a second deal.
    const again = await publicModule.postCapture(widget!.widgetKey, {
      visitorId,
      name: "Ana",
      phone,
    });
    expect(again.ok).toBe(true);

    const { getContactByPhone } = await import("@/modules/crm/contacts");
    const contact = await getContactByPhone(ctx, phone);
    expect(contact).not.toBeNull();

    const { listActivitiesForContact } = await import("@/modules/crm/activities");
    const timeline = await listActivitiesForContact(ctx, contact!.id);
    expect(timeline.filter((row) => row.type === "chat")).toHaveLength(1);
  });

  it("refuses an origin outside the allowlist, and spends nothing", async () => {
    const widget = await makeWidget({ mode: "send", allowedOrigins: ["example.com"] });
    const fetchSpy = stubProvider();

    const outcome = await publicModule.postVisitorMessage(
      widget!.widgetKey,
      { visitorId: newId(), body: "Hola" },
      { origin: "https://somewhere-else.test" },
    );

    expect(outcome).toMatchObject({ ok: false, status: 403 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown or inactive widget key, spending nothing", async () => {
    const fetchSpy = stubProvider();
    expect(await publicModule.resolveWidget("wgt_nope")).toBeNull();

    const widget = await makeWidget({ mode: "send", isActive: false });
    const outcome = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId: newId(),
      body: "Hola",
    });
    expect(outcome).toMatchObject({ ok: false, status: 404 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never leaks a chat conversation to another business", async () => {
    await setTenantAi("send");
    const widget = await makeWidget({ mode: "send" });
    stubProvider();

    const outcome = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId: newId(),
      body: "Hola",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(await conversationsModule.getConversation(elsewhere, outcome.data.conversationId)).toBeNull();
    expect(
      (await conversationsModule.listConversations(elsewhere)).map((row) => row.id),
    ).not.toContain(outcome.data.conversationId);
    expect(await widgetsModule.getChatWidget(elsewhere, widget!.id)).toBeNull();
  });

  it("keeps chat drafts out of the WhatsApp inbox", async () => {
    // The table is shared; the two inboxes are not. listPendingDrafts filters
    // on the WhatsApp conversation id, which a chat row does not have.
    await setTenantAi("draft");
    const widget = await makeWidget({ mode: "send" });
    stubProvider();

    const outcome = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId: newId(),
      body: "Hola",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const waDrafts = await repliesModule.listPendingDrafts(ctx, outcome.data.conversationId);
    expect(waDrafts).toHaveLength(0);
  });

  it("refuses to deliver a chat row over WhatsApp", async () => {
    // ai_replies is shared, so the WhatsApp deliver path must reject a row
    // that has no conversation to send into rather than reach sendText.
    const reply = await repliesModule.recordReply(ctx, {
      channel: "chat",
      chatConversationId: newId(),
      mode: "send",
      status: "draft",
      prompt: "p",
      body: "hola",
    });

    const { deliverReply } = await import("@/modules/ai/reply");
    const outcome = await deliverReply(ctx, reply!.id);
    expect(outcome.status).toBe("failed");
  });
});
