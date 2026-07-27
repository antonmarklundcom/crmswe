import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Cross-tenant isolation for the WhatsApp tables added in 1D (PLAN.md §3.3
// layer 3 merge gate), plus the two reliability-critical behaviors called
// out in §6.3: idempotent inbound processing and fail-closed routing for an
// unrecognized phone_number_id. Runs only against a real MySQL, same
// convention as the other isolation suites.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("whatsapp isolation + webhook processing", () => {
  let db: (typeof import("@/db/client"))["db"];
  let schema: typeof import("@/db/schema");
  let newId: (typeof import("@/lib/ids"))["newId"];
  let createTenant: (typeof import("@/modules/tenancy/tenants"))["createTenant"];
  let buildSystemTenantContext: (typeof import("@/modules/tenancy/context"))["buildSystemTenantContext"];
  let connectAccountManually: (typeof import("./accounts"))["connectAccountManually"];
  let resolveAccountByPhoneNumberId: (typeof import("./accounts"))["resolveAccountByPhoneNumberId"];
  let persistRawEvent: (typeof import("./webhook"))["persistRawEvent"];
  let processWebhookEvent: (typeof import("./webhook"))["processWebhookEvent"];
  let sendText: (typeof import("./send"))["sendText"];
  let listConversations: (typeof import("./inbox"))["listConversations"];
  let syncTemplates: (typeof import("./templates"))["syncTemplates"];
  let listTemplates: (typeof import("./templates"))["listTemplates"];
  let listApprovedTemplates: (typeof import("./templates"))["listApprovedTemplates"];
  let accountIdA: string;

  type TenantContext = import("@/modules/tenancy/context").TenantContext;
  const superadmin = { userId: "sa-test", impersonatorUserId: null } as const;

  let ctxA: TenantContext;
  let ctxB: TenantContext;
  let phoneNumberIdA: string;

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    schema = await import("@/db/schema");
    ({ newId } = await import("@/lib/ids"));
    ({ createTenant } = await import("@/modules/tenancy/tenants"));
    ({ buildSystemTenantContext } = await import("@/modules/tenancy/context"));
    ({ connectAccountManually, resolveAccountByPhoneNumberId } = await import("./accounts"));
    ({ persistRawEvent, processWebhookEvent } = await import("./webhook"));
    ({ sendText } = await import("./send"));
    ({ listConversations } = await import("./inbox"));
    ({ syncTemplates, listTemplates, listApprovedTemplates } = await import("./templates"));
    await import("./jobs"); // registers the whatsapp.* job handlers (unused here, but mirrors prod wiring)

    const tenantA = await createTenant(superadmin, {
      name: "WA Tenant A",
      slug: `wa-tenant-a-${newId()}`,
    });
    const tenantB = await createTenant(superadmin, {
      name: "WA Tenant B",
      slug: `wa-tenant-b-${newId()}`,
    });
    ctxA = (await buildSystemTenantContext(tenantA!.id))!;
    ctxB = (await buildSystemTenantContext(tenantB!.id))!;

    phoneNumberIdA = `pn-a-${newId()}`;
    const accountA = await connectAccountManually(ctxA, {
      wabaId: `waba-a-${newId()}`,
      phoneNumberId: phoneNumberIdA,
      accessToken: "test-token-a",
    });
    accountIdA = accountA!.id;
    await connectAccountManually(ctxB, {
      wabaId: `waba-b-${newId()}`,
      phoneNumberId: `pn-b-${newId()}`,
      accessToken: "test-token-b",
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

  /** Stands in for Meta's GET /{waba_id}/message_templates. */
  function stubTemplatesFetch(
    templates: Array<{ name: string; language: string; status: string }>,
  ) {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: templates }), { status: 200 }),
    );
  }

  it("resolves a phone_number_id to the correct tenant's account, never the other tenant's", async () => {
    const account = await resolveAccountByPhoneNumberId(phoneNumberIdA);
    expect(account?.tenantId).toBe(ctxA.tenantId);
    expect(account?.tenantId).not.toBe(ctxB.tenantId);
  });

  function inboundTextPayload(
    phoneNumberId: string,
    waMessageId: string,
    from: string,
    body: string,
  ) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneNumberId },
                contacts: [{ profile: { name: "Cliente Test" }, wa_id: from }],
                messages: [
                  { from, id: waMessageId, timestamp: `${Date.now()}`, type: "text", text: { body } },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  it("processes an inbound message into tenant A only — contact/conversation never leak to tenant B", async () => {
    const from = `59898${newId().slice(0, 7)}`;
    const eventId = await persistRawEvent(
      inboundTextPayload(phoneNumberIdA, `wamid-${newId()}`, from, "Hola"),
      phoneNumberIdA,
    );

    await processWebhookEvent(eventId);

    const [event] = await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.id, eventId));
    expect(event.status).toBe("processed");

    const conversationsA = await listConversations(ctxA);
    const conversationsB = await listConversations(ctxB);
    expect(conversationsA.length).toBeGreaterThan(0);
    expect(conversationsB.length).toBe(0);
  });

  it("is idempotent: redelivering the same wa_message_id never creates a second message", async () => {
    const from = `59899${newId().slice(0, 7)}`;
    const waMessageId = `wamid-${newId()}`;
    const payload = inboundTextPayload(phoneNumberIdA, waMessageId, from, "Primero");

    const eventId1 = await persistRawEvent(payload, phoneNumberIdA);
    await processWebhookEvent(eventId1);

    // Meta redelivers the identical message id in a second webhook event.
    const eventId2 = await persistRawEvent(payload, phoneNumberIdA);
    await processWebhookEvent(eventId2);

    const rows = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.waMessageId, waMessageId));
    expect(rows).toHaveLength(1);
  });

  it("fails closed on an unrecognized phone_number_id instead of guessing a tenant", async () => {
    const unknownPhoneNumberId = `pn-unknown-${newId()}`;
    const eventId = await persistRawEvent(
      inboundTextPayload(unknownPhoneNumberId, `wamid-${newId()}`, "598900000000", "hola"),
      unknownPhoneNumberId,
    );

    await processWebhookEvent(eventId);

    const [updated] = await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.id, eventId));
    expect(updated.status).toBe("failed");
  });

  it("syncTemplates inserts, updates, and prunes — scoped to the syncing tenant only", async () => {
    stubTemplatesFetch([
      { name: "bienvenida", language: "es", status: "APPROVED" },
      { name: "seguimiento", language: "es", status: "PENDING" },
    ]);
    await syncTemplates(ctxA, accountIdA);

    let templatesA = await listTemplates(ctxA, accountIdA);
    expect(templatesA.map((t) => t.name).sort()).toEqual(["bienvenida", "seguimiento"]);
    expect((await listApprovedTemplates(ctxA, accountIdA)).map((t) => t.name)).toEqual([
      "bienvenida",
    ]);

    // Second sync: "seguimiento" got approved upstream, "bienvenida" was
    // deleted at Meta, and a new template appeared.
    stubTemplatesFetch([
      { name: "seguimiento", language: "es", status: "APPROVED" },
      { name: "recordatorio", language: "es", status: "APPROVED" },
    ]);
    await syncTemplates(ctxA, accountIdA);

    templatesA = await listTemplates(ctxA, accountIdA);
    expect(templatesA.map((t) => t.name).sort()).toEqual(["recordatorio", "seguimiento"]);
    expect(templatesA.find((t) => t.name === "seguimiento")?.status).toBe("APPROVED");

    // Tenant B never sees tenant A's templates.
    const accountsB = await db
      .select()
      .from(schema.waAccounts)
      .where(eq(schema.waAccounts.tenantId, ctxB.tenantId));
    expect(await listTemplates(ctxB, accountsB[0].id)).toHaveLength(0);
  });

  it("syncTemplates marks the account errored when Meta rejects the token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid token", { status: 401 }),
    );

    await expect(syncTemplates(ctxA, accountIdA)).rejects.toThrow(/Template sync failed/);

    const [account] = await db
      .select()
      .from(schema.waAccounts)
      .where(eq(schema.waAccounts.id, accountIdA));
    expect(account.status).toBe("error");

    // Restore for the send tests below, which need a connected account.
    await db
      .update(schema.waAccounts)
      .set({ status: "connected" })
      .where(eq(schema.waAccounts.id, accountIdA));
  });

  it("sendText rejects when the 24h window is closed and queues nothing", async () => {
    const conversations = await listConversations(ctxA);
    const conversation = conversations[0];
    expect(conversation).toBeDefined();

    // Force the window closed regardless of what earlier tests left behind.
    await db
      .update(schema.conversations)
      .set({ lastInboundAt: new Date(Date.now() - 48 * 60 * 60 * 1000) })
      .where(eq(schema.conversations.id, conversation.id));

    await expect(sendText(ctxA, { conversationId: conversation.id, body: "hola" })).rejects.toThrow(
      /ventana de 24 horas/,
    );
  });

  it("sendText queues an outbound message + job when the window is open", async () => {
    const conversations = await listConversations(ctxA);
    const conversation = conversations[0];

    await db
      .update(schema.conversations)
      .set({ lastInboundAt: new Date() })
      .where(eq(schema.conversations.id, conversation.id));

    const messageId = await sendText(ctxA, { conversationId: conversation.id, body: "Hola de vuelta" });

    const [message] = await db.select().from(schema.messages).where(eq(schema.messages.id, messageId));
    expect(message.direction).toBe("out");
    expect(message.status).toBe("queued");

    const jobs = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.type, "whatsapp.send"));
    expect(jobs.some((j) => (j.payload as { messageId?: string }).messageId === messageId)).toBe(true);
  });
});
