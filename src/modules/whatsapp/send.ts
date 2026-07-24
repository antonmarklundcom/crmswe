import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, conversations, messages } from "@/db/schema";
import { newId } from "@/lib/ids";
import { enqueue } from "@/lib/queue";
import { buildSystemTenantContext, type TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
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
  input: { type: "text" | "template"; body: string; graphPayload: Record<string, unknown> },
) {
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
