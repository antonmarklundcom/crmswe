import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/config/env";

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
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(
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
    // Re-stubbing an already-stubbed `fetch` hands back the *same* spy, call
    // history included. A case that stubs again mid-test to watch what
    // happens next means "from here on", so start its ledger empty.
    spy.mockClear();
    return spy;
  }

  /** `mergeTenantSettings` deep-merges `ai`, so a cap one case lowered stays
   * lowered for every case after it. Every caller therefore states the cap it
   * means rather than inheriting whoever ran last. */
  async function setTenantAi(mode: "draft" | "send", enabled = true, cap = 200) {
    const { updateTenantAiSettings } = await import("@/modules/tenancy/settings");
    await updateTenantAiSettings(ctx, { enabled, mode, maxRepliesPerTenantPerDay: cap });
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
      currency: "SEK",
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

  it("counts what the rep has not read, and stops counting once they have", async () => {
    // The column exists to answer "is anyone waiting". Written on every
    // inbound message and cleared when the rep opens the thread — /chat
    // renders the whole transcript, so opening the page is opening it.
    await setTenantAi("send");
    const widget = await makeWidget({ mode: "off" });
    const visitorId = newId();

    await publicModule.postVisitorMessage(widget!.widgetKey, { visitorId, body: "Hola" });
    await publicModule.postVisitorMessage(widget!.widgetKey, { visitorId, body: "¿Están?" });

    const conversation = await conversationsModule.findOpenConversation(
      ctx,
      widget!.id,
      visitorId,
    );
    expect(conversation!.unreadCount).toBe(2);

    // A rep answering is not something the rep has to read back.
    await conversationsModule.appendMessage(ctx, {
      chatConversationId: conversation!.id,
      direction: "out",
      author: "agent",
      body: "Sí, contamos.",
    });
    expect((await conversationsModule.getConversation(ctx, conversation!.id))!.unreadCount).toBe(2);

    await conversationsModule.markConversationRead(ctx, conversation!.id);
    expect((await conversationsModule.getConversation(ctx, conversation!.id))!.unreadCount).toBe(0);
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

    await setTenantAi("send");
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

  it("asks for a Turnstile token before the first provider call, once", async () => {
    await setTenantAi("send");
    const widget = await makeWidget({ mode: "send" });

    const { setSiteTurnstile } = await import("@/modules/sites/settings");
    await setSiteTurnstile(ctx, widget!.siteId, { siteKey: "0x-site", secret: "0x-secret" });

    const visitorId = newId();
    let turnstilePasses = false;
    const calls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("challenges.cloudflare.com")) {
        return new Response(JSON.stringify({ success: turnstilePasses }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          model: "gpt-4o-mini",
          choices: [{ message: { content: "Claro." } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 },
      );
    });
    const providerCalls = () => calls.filter((url) => !url.includes("cloudflare")).length;

    // No token: the message is still captured, and the visitor is told a
    // person is coming — never an error, never "you look like a bot".
    const first = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId,
      body: "Hola",
    });
    expect(first.ok).toBe(true);
    expect(first.ok && first.data.pendingHuman).toBe(true);
    expect(first.ok && first.data.messages.map((m) => m.body)).toContain("Hola");
    expect(providerCalls()).toBe(0);

    // A rejected token spends nothing either, and leaves the challenge owed.
    const rejected = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId,
      body: "¿Hay alguien?",
      turnstileToken: "stale",
    });
    expect(rejected.ok && rejected.data.pendingHuman).toBe(true);
    expect(providerCalls()).toBe(0);

    turnstilePasses = true;
    const passed = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId,
      body: "Quiero un presupuesto",
      turnstileToken: "good",
    });
    expect(passed.ok && passed.data.pendingHuman).toBe(false);
    expect(providerCalls()).toBe(1);

    // Once per conversation, not once per message: the visitor solved it and
    // now they are talking.
    const after = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId,
      body: "¿Y el plazo?",
    });
    expect(after.ok && after.data.pendingHuman).toBe(false);
    expect(providerCalls()).toBe(2);

    fetchSpy.mockRestore();
    const { clearSiteTurnstile } = await import("@/modules/sites/settings");
    await clearSiteTurnstile(ctx, widget!.siteId);
  });

  it("stops chat at its half of the budget while WhatsApp still has room", async () => {
    // The shared ceiling bounds the bill (§1.3) and stays shared. This bounds
    // which channel gets to spend it: the public widget must not be able to
    // burn the allowance a customer already mid-thread on WhatsApp needs.
    // Its own tenant, because the assertion is about a *daily total* and the
    // cases above have already spent against the shared one.
    const { createTenant } = await import("@/modules/tenancy/tenants");
    const fresh = await createTenant(
      { userId: "sa-chat", impersonatorUserId: null },
      { name: `Cap ${newId()}`, slug: `cap-${newId().toLowerCase()}` },
    );
    const capped: TenantContext = { ...ctx, tenantId: fresh!.id };

    const { updateTenantAiSettings } = await import("@/modules/tenancy/settings");
    await updateTenantAiSettings(capped, {
      enabled: true,
      mode: "send",
      maxRepliesPerTenantPerDay: 4, // chat's half is 2
    });

    const site = await (await import("@/modules/sites/sites")).createSite(capped, {
      name: `Site ${newId()}`,
      slug: `s-${newId().toLowerCase()}`,
    });
    const widget = await widgetsModule.createChatWidget(capped, {
      siteId: site.id,
      name: "Asistente",
      mode: "send",
    });

    for (let i = 0; i < 2; i += 1) {
      await repliesModule.recordReply(capped, {
        channel: "chat",
        chatConversationId: newId(),
        mode: "send",
        status: "sent",
        prompt: "chat",
      });
    }

    const fetchSpy = stubProvider();
    const outcome = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId: newId(),
      body: "Hola",
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.data.pendingHuman).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    // And it is the sub-cap that bit, not the shared ceiling: the tenant has
    // half its budget left, which is exactly what WhatsApp still has.
    expect(await repliesModule.countRepliesTodayForTenant(capped)).toBe(2);
    expect(await repliesModule.countRepliesTodayForChannel(capped, "chat")).toBe(2);
    expect(await repliesModule.countRepliesTodayForChannel(capped, "whatsapp")).toBe(0);
  });

  it("bounds how fast one visitor may poll", async () => {
    const widget = await makeWidget({ mode: "send" });
    const visitorId = newId();

    for (let i = 0; i < 15; i += 1) {
      const polled = await publicModule.pollMessages(widget!.widgetKey, visitorId, null, {
        ipKey: "203.0.113.7",
      });
      expect(polled.ok).toBe(true);
    }

    const limited = await publicModule.pollMessages(widget!.widgetKey, visitorId, null, {
      ipKey: "203.0.113.7",
    });
    expect(limited).toMatchObject({ ok: false, status: 429 });
  });

  it("serves a configured allowlist its own legitimate traffic", async () => {
    // The case the allowlist used to break outright: a tenant fills in
    // `allowed_origins`, and every real request — which comes from OUR iframe
    // and therefore carries OUR origin, or none at all on the GET poll — was
    // answered 403. The check now lives on the iframe document (below), so
    // the whole flow works with a list configured.
    await setTenantAi("send");
    const widget = await makeWidget({ mode: "send", allowedOrigins: ["example.com"] });
    const fetchSpy = stubProvider("Con gusto.");
    const visitorId = newId();

    const posted = await publicModule.postVisitorMessage(
      widget!.widgetKey,
      { visitorId, body: "Hola" },
      // Same-origin POST from the iframe: the browser sends the CRM's origin.
      { origin: env.APP_URL },
    );
    expect(posted.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();

    // Same-origin GET: the browser sends no Origin at all.
    const polled = await publicModule.pollMessages(widget!.widgetKey, visitorId, null, {});
    expect(polled).toMatchObject({ ok: true });
    expect(polled.ok && polled.data.messages.length).toBeGreaterThan(0);

    const captured = await publicModule.postCapture(
      widget!.widgetKey,
      { visitorId, name: "Ana", phone: `+59598${Math.floor(Math.random() * 1e7)}` },
      { origin: env.APP_URL },
    );
    expect(captured.ok).toBe(true);
  });

  it("refuses a cross-origin API call, and spends nothing", async () => {
    // Not the tenant's allowlist — a same-origin assertion. Nothing but our
    // own iframe has any business calling these routes.
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

  it("blocks the iframe document when the embedding page is not on the list", async () => {
    const widget = await makeWidget({ mode: "send", allowedOrigins: ["example.com"] });

    expect(publicModule.embedRefererAllowed(widget!, "https://example.com/precios")).toBe(true);
    expect(publicModule.embedRefererAllowed(widget!, "https://somewhere-else.test/")).toBe(false);
    // A referrer the host page suppressed is not an embed the tenant named.
    expect(publicModule.embedRefererAllowed(widget!, null)).toBe(false);

    const open = await makeWidget({ mode: "send" });
    expect(publicModule.embedRefererAllowed(open!, null)).toBe(true);
    expect(publicModule.embedRefererAllowed(open!, "https://anywhere.test/")).toBe(true);
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

  it("reopens a closed thread, and the visitor comes back to it", async () => {
    // Closing was one-way until the list learned to filter: the transcript of
    // a thread closed by mistake was reachable only from the database, and
    // `findOpenConversation` would have started the returning visitor a
    // second, empty one.
    await setTenantAi("send");
    const widget = await makeWidget({ mode: "send" });
    stubProvider();

    const visitorId = newId();
    const outcome = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId,
      body: "Hola",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const conversationId = outcome.data.conversationId;

    await conversationsModule.closeConversation(ctx, conversationId);
    expect(
      (await conversationsModule.listConversations(ctx, { status: "open" })).map((row) => row.id),
    ).not.toContain(conversationId);
    expect(
      (await conversationsModule.listConversations(ctx, { status: "closed" })).map((row) => row.id),
    ).toContain(conversationId);
    // No filter at all is the "all" tab, and it must still show it.
    expect((await conversationsModule.listConversations(ctx)).map((row) => row.id)).toContain(
      conversationId,
    );

    await conversationsModule.reopenConversation(ctx, conversationId);
    expect(
      (await conversationsModule.listConversations(ctx, { status: "open" })).map((row) => row.id),
    ).toContain(conversationId);

    const again = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId,
      body: "Sigo acá",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.data.conversationId).toBe(conversationId);
  });

  it("gives a thread only to an active member of its own business", async () => {
    await setTenantAi("draft");
    const widget = await makeWidget({ mode: "draft" });
    stubProvider();

    const outcome = await publicModule.postVisitorMessage(widget!.widgetKey, {
      visitorId: newId(),
      body: "¿Atienden hoy?",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const conversationId = outcome.data.conversationId;

    const { db } = await import("@/db/client");
    const schema = await import("@/db/schema");
    const memberId = newId();
    const outsiderId = newId();
    await db.insert(schema.users).values([
      {
        id: memberId,
        tenantId: ctx.tenantId,
        email: `chat-member-${memberId}@example.com`,
        name: "Rep Activa",
        role: "agent",
      },
      {
        id: outsiderId,
        tenantId: elsewhere.tenantId,
        email: `chat-outsider-${outsiderId}@example.com`,
        name: "Otro Tenant",
        role: "agent",
      },
    ]);
    // Access is the membership, not `users.tenant_id` (PLAN.md §3.1).
    await db.insert(schema.tenantMemberships).values([
      { id: newId(), tenantId: ctx.tenantId, userId: memberId, role: "agent" },
      { id: newId(), tenantId: elsewhere.tenantId, userId: outsiderId, role: "agent" },
    ]);

    await conversationsModule.assignConversation(ctx, conversationId, memberId);
    expect((await conversationsModule.getConversation(ctx, conversationId))?.assignedUserId).toBe(
      memberId,
    );

    // The id arrives from a form, so an unchecked one would park a customer's
    // conversation on somebody who cannot open this business at all.
    await expect(
      conversationsModule.assignConversation(ctx, conversationId, outsiderId),
    ).rejects.toThrow("chat_assign_userNotFound");
    expect((await conversationsModule.getConversation(ctx, conversationId))?.assignedUserId).toBe(
      memberId,
    );

    await conversationsModule.assignConversation(ctx, conversationId, null);
    expect(
      (await conversationsModule.getConversation(ctx, conversationId))?.assignedUserId,
    ).toBeNull();
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
