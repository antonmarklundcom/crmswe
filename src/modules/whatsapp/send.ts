import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, conversations, messages } from "@/db/schema";
import { newId } from "@/lib/ids";
import { enqueue } from "@/lib/queue";
import { buildSystemTenantContext, type TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { whatsappEnabledFor } from "./feature";
import { getAccount, getDecryptedAccessToken } from "./accounts";
import { GRAPH_API_BASE } from "./graph";

// Outbound sends (PLAN.md §6.4). All outbound goes through this service —
// the 24h window / template enforcement lives here so callers (inbox UI,
// automations, quotes) can't bypass it.

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type SendTextInput = { conversationId: string; body: string };
export type SendTemplateInput = {
  conversationId: string;
  templateName: string;
  language: string;
  components?: unknown[];
};

export type SendDocumentInput = {
  conversationId: string;
  /** Publicly reachable HTTPS URL — Meta fetches the file itself. */
  link: string;
  filename: string;
  caption?: string;
};

export async function sendText(ctx: TenantContext, input: SendTextInput) {
  const conversation = await getConversationOrThrow(ctx, input.conversationId);

  if (!withinFreeFormWindow(conversation.lastInboundAt)) {
    throw new Error(
      "La ventana de 24 horas está cerrada — solo se pueden enviar plantillas aprobadas.",
    );
  }

  return queueOutboundMessage(ctx, conversation.id, {
    type: "text",
    body: input.body,
    graphPayload: { messaging_product: "whatsapp", type: "text", text: { body: input.body } },
  });
}

/** Templates are always allowed, inside or outside the window (§6.4). */
export async function sendTemplate(ctx: TenantContext, input: SendTemplateInput) {
  const conversation = await getConversationOrThrow(ctx, input.conversationId);

  return queueOutboundMessage(ctx, conversation.id, {
    type: "template",
    body: input.templateName,
    graphPayload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.language },
        components: input.components ?? [],
      },
    },
  });
}

/**
 * Documents are ordinary free-form messages as far as Meta is concerned, so
 * they need an open 24h window just like text (§6.4). Quote delivery (§8)
 * calls this; when the window is shut the caller falls back to the public
 * link rather than silently failing.
 */
export async function sendDocument(ctx: TenantContext, input: SendDocumentInput) {
  const conversation = await getConversationOrThrow(ctx, input.conversationId);

  if (!withinFreeFormWindow(conversation.lastInboundAt)) {
    throw new Error(
      "La ventana de 24 horas está cerrada — solo se pueden enviar plantillas aprobadas.",
    );
  }

  return queueOutboundMessage(ctx, conversation.id, {
    type: "document",
    body: input.caption ?? input.filename,
    graphPayload: {
      messaging_product: "whatsapp",
      type: "document",
      document: { link: input.link, filename: input.filename, caption: input.caption },
    },
  });
}

function withinFreeFormWindow(lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - lastInboundAt.getTime() < WINDOW_MS;
}

async function getConversationOrThrow(ctx: TenantContext, conversationId: string) {
  const [conversation] = await tenantDb(ctx).select(
    conversations,
    eq(conversations.id, conversationId),
  );
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);
  return conversation;
}

async function queueOutboundMessage(
  ctx: TenantContext,
  conversationId: string,
  input: {
    type: "text" | "template" | "document";
    body: string;
    graphPayload: Record<string, unknown>;
  },
) {
  // The outbound half of the channel switch (plan.md §5.3.1). O3 closed the
  // inbound side — the webhook stops ingesting — but this is the door that
  // matters *after* a tenant turns WhatsApp off: nothing in the UI can reach
  // it any more, and yet an automation node, a booking reminder or an AI
  // auto-reply still holds a conversation id from before and would happily
  // keep messaging that customer.
  //
  // `sendText` looked safe because it needs an open 24-hour window, which
  // closes on its own once inbound stops. `sendTemplate` has no such
  // requirement, so a template could go out indefinitely.
  //
  // Checked here rather than in the three public functions above, because
  // this is the single point every outbound message passes through — a
  // fourth send helper added later gets the guard for free.
  if (!(await whatsappEnabledFor(ctx))) throw new Error("whatsapp_disabled");

  const messageId = newId();
  await tenantDb(ctx)
    .insert(messages)
    .values({
      id: messageId,
      conversationId,
      direction: "out",
      type: input.type,
      body: input.body,
      status: "queued",
    });

  // Sends are serialized per wa_account by nature of the single-process
  // worker's sequential job loop (§2.1) — good enough throughput
  // conservatism for Phase 1 without extra coordination.
  await enqueue(
    "whatsapp.send",
    { messageId, graphPayload: input.graphPayload },
    { tenantId: ctx.tenantId },
  );

  return messageId;
}

/** Job handler body (registered in ./jobs.ts) — the actual Graph API call. */
export async function deliverQueuedMessage(
  tenantId: string,
  messageId: string,
  graphPayload: Record<string, unknown>,
): Promise<void> {
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!message) return;

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, message.conversationId));
  if (!conversation) return;

  // No TenantContext at this layer (job payloads carry raw ids, §3.3) — a
  // system context scoped to the job's own tenantId, same pattern as
  // webhook processing.
  const ctx = await buildSystemTenantContext(tenantId);
  if (!ctx) return;

  const account = await getAccount(ctx, conversation.waAccountId);
  if (!account) {
    await failMessage(messageId, "WhatsApp account not found");
    return;
  }

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, conversation.contactId));
  if (!contact) {
    await failMessage(messageId, "Contact not found");
    return;
  }

  const token = getDecryptedAccessToken(account);
  const payload = { ...graphPayload, to: contact.phone.replace(/^\+/, "") };

  const res = await fetch(`${GRAPH_API_BASE}/${account.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    await failMessage(messageId, errorBody.slice(0, 2000));
    throw new Error(`WhatsApp send failed: ${res.status} ${errorBody.slice(0, 200)}`);
  }

  const result = (await res.json()) as { messages?: Array<{ id: string }> };
  const waMessageId = result.messages?.[0]?.id;

  await db.update(messages).set({ status: "sent", waMessageId }).where(eq(messages.id, messageId));
}

async function failMessage(messageId: string, error: string) {
  await db
    .update(messages)
    .set({ status: "failed", error: { message: error } })
    .where(eq(messages.id, messageId));
}
