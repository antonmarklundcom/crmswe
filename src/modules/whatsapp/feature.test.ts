import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isWhatsappEnabled } from "./feature";

// The flag-off half of plan.md §5.3.1. Its sibling is ./isolation.test.ts,
// which switches the flag on and asserts the whole module still works — the
// exit criterion is "invisible with the flag off, functional with it on", and
// neither half means anything without the other.
//
// The pure predicate is tested without a database because that is where the
// default lives, and the default is the part that must not drift: a tenant
// row that has never heard of this field has to read as "no WhatsApp".

describe("isWhatsappEnabled", () => {
  it("is off for a tenant that has never been asked", () => {
    // Every inherited vendercrm tenant, and every tenant created since, has
    // no key here. Sweden is e-post-first (plan.md §1.7), so absent is off.
    expect(isWhatsappEnabled(undefined)).toBe(false);
    expect(isWhatsappEnabled(null)).toBe(false);
    expect(isWhatsappEnabled({})).toBe(false);
    expect(isWhatsappEnabled({ whatsappEnabled: undefined })).toBe(false);
  });

  it("is on only for an explicit true", () => {
    expect(isWhatsappEnabled({ whatsappEnabled: true })).toBe(true);
    expect(isWhatsappEnabled({ whatsappEnabled: false })).toBe(false);
  });

  it("does not treat a truthy non-boolean as on", () => {
    // `settings` is a JSON column, so what comes back is whatever was
    // written — including, after a hand-edited row or a bad migration, a
    // string. Turning a channel on is not something a stray "false" should
    // be able to do by being truthy.
    const settings = { whatsappEnabled: "false" } as unknown as Parameters<
      typeof isWhatsappEnabled
    >[0];
    expect(isWhatsappEnabled(settings)).toBe(false);
  });
});

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("the WhatsApp channel switch (MySQL integration)", () => {
  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  let db: (typeof import("@/db/client"))["db"];
  let ctx: TenantContext;
  let phoneNumberId: string;
  let newId: (typeof import("@/lib/ids"))["newId"];

  let whatsappEnabledFor: (typeof import("./feature"))["whatsappEnabledFor"];
  let whatsappEnabledForTenantId: (typeof import("./feature"))["whatsappEnabledForTenantId"];
  let updateTenantWhatsappEnabled: (typeof import("@/modules/tenancy/settings"))["updateTenantWhatsappEnabled"];
  let persistRawEvent: (typeof import("./webhook"))["persistRawEvent"];
  let processWebhookEvent: (typeof import("./webhook"))["processWebhookEvent"];
  let listConversations: (typeof import("./inbox"))["listConversations"];

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    ({ newId } = await import("@/lib/ids"));
    ({ whatsappEnabledFor, whatsappEnabledForTenantId } = await import("./feature"));
    ({ updateTenantWhatsappEnabled } = await import("@/modules/tenancy/settings"));
    ({ persistRawEvent, processWebhookEvent } = await import("./webhook"));
    ({ listConversations } = await import("./inbox"));

    const { createTenant } = await import("@/modules/tenancy/tenants");
    const { buildSystemTenantContext } = await import("@/modules/tenancy/context");
    const { connectAccountManually } = await import("./accounts");

    const tenant = await createTenant(
      { userId: "sa-feature", impersonatorUserId: null },
      { name: "Flagga AB", slug: `flagga-${newId().toLowerCase()}` },
    );
    ctx = (await buildSystemTenantContext(tenant!.id))!;

    // A connected number, deliberately: the interesting case is a tenant
    // that *could* receive WhatsApp and has the channel switched off, not one
    // that was never set up.
    phoneNumberId = `pn-flag-${newId()}`;
    await connectAccountManually(ctx, {
      wabaId: `waba-flag-${newId()}`,
      phoneNumberId,
      accessToken: "test-token",
    });
  });

  afterAll(async () => {
    if (!db) return;
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  });

  /** One inbound text, shaped the way Meta sends it. */
  function inbound(body: string) {
    return {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneNumberId },
                contacts: [{ profile: { name: "Karin" }, wa_id: "46701234567" }],
                messages: [
                  {
                    from: "46701234567",
                    id: `wamid-${newId()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  async function statusOf(eventId: string): Promise<string> {
    const { eq } = await import("drizzle-orm");
    const { webhookEvents } = await import("@/db/schema");
    const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    return row.status;
  }

  it("reads as off for a brand-new tenant", async () => {
    expect(await whatsappEnabledFor(ctx)).toBe(false);
    expect(await whatsappEnabledForTenantId(ctx.tenantId)).toBe(false);
  });

  it("does not ingest inbound messages while the channel is off", async () => {
    // The point is not tidiness. Meta keeps delivering for as long as the
    // number is connected, and a tenant with the channel hidden has no
    // screen to read those messages on, no way to answer them, and no way to
    // erase them — so writing the sender's name, number and message body
    // into the database would be collecting personal data nobody asked for
    // and nobody can reach (plan.md §5.3.3).
    const eventId = await persistRawEvent(inbound("Hej, är ni öppna?"), phoneNumberId);
    await processWebhookEvent(eventId);

    expect(await statusOf(eventId)).toBe("skipped");
    expect(await listConversations(ctx)).toHaveLength(0);
  });

  it("ingests the moment the tenant switches the channel on", async () => {
    // Flipping it back is one write, and nothing about the module changed
    // while it was off — that is the whole reason the code stayed (plan.md
    // §1.1: vendercrm and this fork trade cherry-picks).
    await updateTenantWhatsappEnabled(ctx, true);
    expect(await whatsappEnabledFor(ctx)).toBe(true);

    const eventId = await persistRawEvent(inbound("Hej igen!"), phoneNumberId);
    await processWebhookEvent(eventId);

    expect(await statusOf(eventId)).toBe("processed");
    const conversations = await listConversations(ctx);
    expect(conversations).toHaveLength(1);
  });

  it("refuses to send outbound while the channel is off", async () => {
    // The half that matters *after* a tenant switches WhatsApp off. Nothing
    // in the UI can reach the channel any more, but an automation node, a
    // booking reminder or an AI auto-reply still holds a conversation id
    // from before, and `sendTemplate` needs no open 24-hour window to use it.
    await updateTenantWhatsappEnabled(ctx, true);
    const eventId = await persistRawEvent(inbound("Får jag en offert?"), phoneNumberId);
    await processWebhookEvent(eventId);
    const [conversation] = await listConversations(ctx);
    expect(conversation).toBeDefined();

    const { sendText, sendTemplate } = await import("./send");
    // On: both work — the window is open, inbound just arrived.
    await expect(
      sendText(ctx, { conversationId: conversation.id, body: "Javisst!" }),
    ).resolves.toBeTruthy();

    await updateTenantWhatsappEnabled(ctx, false);

    await expect(
      sendText(ctx, { conversationId: conversation.id, body: "Hallå?" }),
    ).rejects.toThrow("whatsapp_disabled");
    await expect(
      sendTemplate(ctx, {
        conversationId: conversation.id,
        templateName: "paminnelse",
        language: "sv",
      }),
    ).rejects.toThrow("whatsapp_disabled");
  });

  it("refuses to deliver a message queued before the channel was switched off", async () => {
    // O3-5: `queueOutboundMessage` only guards the moment a message is
    // enqueued. A template needs no open 24h window, so without a check at
    // delivery time too, a template queued a second before a tenant flips
    // the kill switch would still reach Meta after "off" took effect.
    await updateTenantWhatsappEnabled(ctx, true);
    const eventId = await persistRawEvent(inbound("Kan jag boka?"), phoneNumberId);
    await processWebhookEvent(eventId);
    const [conversation] = await listConversations(ctx);
    expect(conversation).toBeDefined();

    const { sendTemplate, deliverQueuedMessage } = await import("./send");
    const messageId = await sendTemplate(ctx, {
      conversationId: conversation.id,
      templateName: "paminnelse",
      language: "sv",
    });

    await updateTenantWhatsappEnabled(ctx, false);

    await deliverQueuedMessage(ctx.tenantId, messageId, {
      messaging_product: "whatsapp",
      type: "template",
      template: { name: "paminnelse", language: { code: "sv" } },
    });

    const { eq } = await import("drizzle-orm");
    const { messages: messagesTable } = await import("@/db/schema");
    const [message] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, messageId));
    expect(message.status).toBe("failed");
  });

  it("stops ingesting again when it is switched back off", async () => {
    // `mergeTenantSettings` deep-merges, and `false ?? current` would keep a
    // stored `true` — so turning the channel off has to actually turn it off.
    await updateTenantWhatsappEnabled(ctx, false);
    expect(await whatsappEnabledFor(ctx)).toBe(false);

    const before = await listConversations(ctx);
    const eventId = await persistRawEvent(inbound("Och nu då?"), phoneNumberId);
    await processWebhookEvent(eventId);

    expect(await statusOf(eventId)).toBe("skipped");
    // The conversation opened while it was on survives untouched: switching
    // the channel off hides it, it does not delete anything.
    expect(await listConversations(ctx)).toHaveLength(before.length);
  });
});
