import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isAiConfigured } from "@/lib/ai";
import { evaluateGuards, resolveMode, type GuardInput } from "./reply";
import { resolveAiConfig, DEFAULT_MAX_PER_CONVERSATION_PER_DAY } from "./config";

// AI auto-reply (PLAN.md §10 1O). The guard evaluation and mode resolution
// are pure and tested first; the rest needs a real MySQL because the daily
// caps, the kill switch and the draft queue are all rows.

const allowed: GuardInput = {
  tenantAiEnabled: true,
  driverConfigured: true,
  conversationAiDisabled: false,
  optedOut: false,
  withinWindow: true,
  repliesTodayForConversation: 0,
  repliesTodayForTenant: 0,
  maxPerConversationPerDay: 3,
  maxPerTenantPerDay: 200,
};

describe("evaluateGuards", () => {
  it("allows a reply when every guard passes", () => {
    expect(evaluateGuards(allowed)).toEqual({ allowed: true });
  });

  it("refuses outside the 24h window", () => {
    expect(evaluateGuards({ ...allowed, withinWindow: false })).toEqual({
      allowed: false,
      reason: "window_closed",
    });
  });

  it("reports a closed window rather than a cap when both would fire", () => {
    // Order matters for the operator reading the run log: "the window shut"
    // and "you're out of budget" need different fixes.
    expect(
      evaluateGuards({
        ...allowed,
        withinWindow: false,
        repliesTodayForConversation: 99,
        repliesTodayForTenant: 9999,
      }),
    ).toEqual({ allowed: false, reason: "window_closed" });
  });

  it("refuses on the per-conversation and per-tenant daily caps", () => {
    expect(
      evaluateGuards({ ...allowed, repliesTodayForConversation: 3 }).allowed,
    ).toBe(false);
    expect(evaluateGuards({ ...allowed, repliesTodayForTenant: 200 })).toEqual({
      allowed: false,
      reason: "tenant_daily_cap",
    });
  });

  it("refuses when the conversation kill switch is pulled, or the contact opted out", () => {
    expect(evaluateGuards({ ...allowed, conversationAiDisabled: true })).toEqual({
      allowed: false,
      reason: "conversation_ai_disabled",
    });
    expect(evaluateGuards({ ...allowed, optedOut: true })).toEqual({
      allowed: false,
      reason: "contact_opted_out",
    });
  });

  it("refuses when AI is off for the tenant or no provider is configured", () => {
    expect(evaluateGuards({ ...allowed, tenantAiEnabled: false }).allowed).toBe(false);
    expect(evaluateGuards({ ...allowed, driverConfigured: false })).toEqual({
      allowed: false,
      reason: "ai_not_configured",
    });
  });
});

describe("resolveMode", () => {
  it("keeps a node on draft while the tenant is on draft — the ceiling", () => {
    expect(resolveMode("send", "draft")).toBe("draft");
    expect(resolveMode(undefined, "draft")).toBe("draft");
  });

  it("lets an autonomous tenant's node send, and still defaults to draft", () => {
    expect(resolveMode("send", "send")).toBe("send");
    expect(resolveMode(undefined, "send")).toBe("draft");
    expect(resolveMode("draft", "send")).toBe("draft");
  });
});

describe("resolveAiConfig", () => {
  it("defaults an untouched tenant to disabled, draft mode and the standard caps", () => {
    const config = resolveAiConfig("Climatex", undefined);
    expect(config.enabled).toBe(false);
    expect(config.mode).toBe("draft");
    expect(config.maxRepliesPerConversationPerDay).toBe(DEFAULT_MAX_PER_CONVERSATION_PER_DAY);
    expect(config.business.businessName).toBe("Climatex");
    expect(config.handoffKeyword).toBe("humano");
  });

  it("clamps a cap an admin set absurdly high, and ignores a nonsense one", () => {
    expect(
      resolveAiConfig("x", { maxRepliesPerConversationPerDay: 5000 })
        .maxRepliesPerConversationPerDay,
    ).toBe(20);
    expect(
      resolveAiConfig("x", { maxRepliesPerTenantPerDay: -1 }).maxRepliesPerTenantPerDay,
    ).toBe(200);
  });

  it("treats an unrecognised mode as draft", () => {
    expect(resolveAiConfig("x", { mode: "yolo" as "send" }).mode).toBe("draft");
  });
});

// Both come from the environment, never from a mutation in this file: the
// env module parses process.env at import time, and ESM hoists the imports
// above ahead of any statement here, so assigning process.env.AI_DRIVER in
// this file would be dead code. CI sets both (.github/workflows/ci.yml);
// locally, export them alongside DATABASE_URL. Missing either skips this
// block rather than failing it, matching how every other DB-backed suite
// treats a missing DATABASE_URL.
const hasDb = !!process.env.DATABASE_URL;
const canRunEndToEnd = hasDb && isAiConfigured();

describe.skipIf(!canRunEndToEnd)("ai_reply end to end", () => {
  let db: (typeof import("@/db/client"))["db"];
  let schema: typeof import("@/db/schema");
  let newId: (typeof import("@/lib/ids"))["newId"];
  let generateAiReply: (typeof import("./reply"))["generateAiReply"];
  let deliverReply: (typeof import("./reply"))["deliverReply"];
  let listPendingDrafts: (typeof import("./replies"))["listPendingDrafts"];
  let setConversationAiEnabled: (typeof import("./replies"))["setConversationAiEnabled"];
  let monthlyTokenUsage: (typeof import("./replies"))["monthlyTokenUsage"];
  let getOrCreateConversation: (typeof import("@/modules/whatsapp/inbox"))["getOrCreateConversation"];
  let listMessagesForConversation: (typeof import("@/modules/whatsapp/inbox"))["listMessagesForConversation"];
  let updateTenantAiSettings: (typeof import("@/modules/tenancy/settings"))["updateTenantAiSettings"];

  type TenantContext = import("@/modules/tenancy/context").TenantContext;
  const superadmin = { userId: "sa-test", impersonatorUserId: null } as const;

  let ctxA: TenantContext;
  let ctxB: TenantContext;
  let contactIdA: string;
  let conversationIdA: string;

  const eq = async () => (await import("drizzle-orm")).eq;

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    schema = await import("@/db/schema");
    ({ newId } = await import("@/lib/ids"));
    ({ generateAiReply, deliverReply } = await import("./reply"));
    ({ listPendingDrafts, setConversationAiEnabled, monthlyTokenUsage } = await import(
      "./replies"
    ));
    ({ getOrCreateConversation, listMessagesForConversation } = await import(
      "@/modules/whatsapp/inbox"
    ));
    ({ updateTenantAiSettings } = await import("@/modules/tenancy/settings"));

    const { createTenant } = await import("@/modules/tenancy/tenants");
    const { buildSystemTenantContext } = await import("@/modules/tenancy/context");
    const { connectAccountManually } = await import("@/modules/whatsapp/accounts");
    const { createContact } = await import("@/modules/crm/contacts");

    const tenantA = await createTenant(superadmin, {
      name: "AI Tenant A",
      slug: `ai-tenant-a-${newId()}`,
    });
    const tenantB = await createTenant(superadmin, {
      name: "AI Tenant B",
      slug: `ai-tenant-b-${newId()}`,
    });
    ctxA = (await buildSystemTenantContext(tenantA!.id))!;
    ctxB = (await buildSystemTenantContext(tenantB!.id))!;

    // Auto-reply answers WhatsApp, so these tenants run that channel. It is
    // off by default in this edition (plan.md §5.3.1) and the outbound guard
    // in modules/whatsapp/send.ts enforces that — which is the point: an
    // approved AI draft must not reach a customer of a tenant that has
    // switched WhatsApp off.
    const { updateTenantWhatsappEnabled } = await import("@/modules/tenancy/settings");
    await updateTenantWhatsappEnabled(ctxA, true);
    await updateTenantWhatsappEnabled(ctxB, true);

    const accountA = await connectAccountManually(ctxA, {
      wabaId: `waba-ai-a-${newId()}`,
      phoneNumberId: `pn-ai-a-${newId()}`,
      accessToken: "test-token-a",
    });

    const contact = await createContact(ctxA, {
      name: "Cliente IA",
      phone: `+59598${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
    });
    contactIdA = contact!.id;

    const conversation = await getOrCreateConversation(ctxA, accountA!.id, contactIdA);
    conversationIdA = conversation!.id;

    await updateTenantAiSettings(ctxA, {
      enabled: true,
      mode: "draft",
      about: "Instalación de aire acondicionado",
    });
  });

  afterAll(async () => {
    if (!db) return;
    const pool = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
    await pool.end();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Stands in for the provider's HTTP endpoint. A fresh Response per call —
   * a Response body can only be read once, so a shared instance would make
   * the second generation in a test fail for the wrong reason.
   */
  function stubProvider(text = "Hola! Te ayudo con eso.") {
    return vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            model: "gpt-4o-mini",
            choices: [{ message: { content: text } }],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          }),
          { status: 200 },
        ),
    );
  }

  /** Puts an inbound message on the thread and opens/closes the 24h window. */
  async function setWindow(open: boolean) {
    const eqFn = await eq();
    await db
      .update(schema.conversations)
      .set({
        lastInboundAt: open
          ? new Date()
          : new Date(Date.now() - 25 * 60 * 60 * 1000),
      })
      .where(eqFn(schema.conversations.id, conversationIdA));
  }

  async function seedInbound(body = "Hola, quiero una cotización") {
    await db.insert(schema.messages).values({
      id: newId(),
      tenantId: ctxA.tenantId,
      conversationId: conversationIdA,
      direction: "in",
      type: "text",
      body,
      status: "delivered",
    });
  }

  async function clearReplies() {
    const eqFn = await eq();
    await db.delete(schema.aiReplies).where(eqFn(schema.aiReplies.tenantId, ctxA.tenantId));
  }

  it("never calls the provider outside the 24h window", async () => {
    await seedInbound();
    await setWindow(false);
    const fetchSpy = stubProvider();

    const outcome = await generateAiReply(ctxA, {
      contactId: contactIdA,
      conversationId: conversationIdA,
    });

    expect(outcome).toEqual({ status: "skipped", reason: "window_closed" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await listPendingDrafts(ctxA, conversationIdA)).toHaveLength(0);
  });

  it("drafts rather than sends, and stores the prompt, model and token counts", async () => {
    await clearReplies();
    await setWindow(true);
    stubProvider("Buenas! Te paso los detalles.");

    const before = (await listMessagesForConversation(ctxA, conversationIdA)).length;
    const outcome = await generateAiReply(ctxA, {
      contactId: contactIdA,
      conversationId: conversationIdA,
      mode: "send", // asked for autonomous; the tenant is on draft
    });

    expect(outcome.status).toBe("draft");

    const drafts = await listPendingDrafts(ctxA, conversationIdA);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].body).toBe("Buenas! Te paso los detalles.");
    expect(drafts[0].mode).toBe("draft");
    expect(drafts[0].provider).toBe("openai");
    expect(drafts[0].promptTokens).toBe(100);
    expect(drafts[0].completionTokens).toBe(20);
    expect(drafts[0].prompt).toContain("Nunca inventes precios");

    // Nothing left for WhatsApp.
    expect(await listMessagesForConversation(ctxA, conversationIdA)).toHaveLength(before);
  });

  it("sends when a rep approves the draft, and records who approved it", async () => {
    await setWindow(true);
    stubProvider();

    const [draft] = await listPendingDrafts(ctxA, conversationIdA);
    const outcome = await deliverReply(ctxA, draft.id, "user-123");

    expect(outcome.status).toBe("sent");
    expect(await listPendingDrafts(ctxA, conversationIdA)).toHaveLength(0);

    const eqFn = await eq();
    const [row] = await db
      .select()
      .from(schema.aiReplies)
      .where(eqFn(schema.aiReplies.id, draft.id));
    expect(row.status).toBe("sent");
    expect(row.approvedByUserId).toBe("user-123");
    expect(row.messageId).toBeTruthy();
  });

  it("refuses to deliver an approved draft once the window has closed", async () => {
    await clearReplies();
    await setWindow(true);
    stubProvider("Un momento por favor.");
    const generated = await generateAiReply(ctxA, {
      contactId: contactIdA,
      conversationId: conversationIdA,
    });
    expect(generated.status).toBe("draft");

    // The rep walks away; a day later the customer's window lapses.
    await setWindow(false);
    const [draft] = await listPendingDrafts(ctxA, conversationIdA);
    expect(await deliverReply(ctxA, draft.id)).toEqual({
      status: "skipped",
      reason: "window_closed",
    });
  });

  it("sends autonomously once the tenant is switched to send mode", async () => {
    await clearReplies();
    await updateTenantAiSettings(ctxA, { mode: "send" });
    await setWindow(true);
    stubProvider("Claro, te agendo la visita.");

    const outcome = await generateAiReply(ctxA, {
      contactId: contactIdA,
      conversationId: conversationIdA,
      mode: "send",
    });

    expect(outcome.status).toBe("sent");
    const sent = await listMessagesForConversation(ctxA, conversationIdA);
    expect(sent.some((m) => m.body === "Claro, te agendo la visita.")).toBe(true);
  });

  it("honors the per-conversation kill switch", async () => {
    await clearReplies();
    await setWindow(true);
    const fetchSpy = stubProvider();
    await setConversationAiEnabled(ctxA, conversationIdA, false);

    expect(
      await generateAiReply(ctxA, { contactId: contactIdA, conversationId: conversationIdA }),
    ).toEqual({ status: "skipped", reason: "conversation_ai_disabled" });
    expect(fetchSpy).not.toHaveBeenCalled();

    await setConversationAiEnabled(ctxA, conversationIdA, true);
  });

  it("stops at the per-conversation daily cap", async () => {
    await clearReplies();
    await updateTenantAiSettings(ctxA, { maxRepliesPerConversationPerDay: 2 });
    await setWindow(true);
    stubProvider();

    // The cap bounds provider calls, so it applies to drafts exactly as it
    // does to autonomous sends — a draft still costs tokens.
    const attempt = () =>
      generateAiReply(ctxA, { contactId: contactIdA, conversationId: conversationIdA });

    expect((await attempt()).status).toBe("draft");
    expect((await attempt()).status).toBe("draft");
    expect(await attempt()).toEqual({ status: "skipped", reason: "conversation_daily_cap" });

    await updateTenantAiSettings(ctxA, { maxRepliesPerConversationPerDay: 3, mode: "draft" });
  });

  it("meters tokens per tenant and leaks nothing across the tenant boundary", async () => {
    const usageA = await monthlyTokenUsage(ctxA);
    expect(usageA.replies).toBeGreaterThan(0);
    expect(usageA.promptTokens).toBeGreaterThan(0);

    // Tenant B never generated anything, and cannot see A's rows.
    expect(await monthlyTokenUsage(ctxB)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      replies: 0,
    });
    expect(await listPendingDrafts(ctxB, conversationIdA)).toEqual([]);
  });
});
