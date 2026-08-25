import { and, eq, gte } from "drizzle-orm";
import { chatConversations, chatMessages } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Chat conversation + message persistence (docs/SPEC-CHAT-WIDGET.md §2).
// The `messages` status/audit vocabulary, reused rather than reinvented.

export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;

export type StartConversationInput = {
  widgetId: string;
  siteId: string;
  visitorId: string;
  pageUrl?: string;
  referrer?: string;
  utm?: Record<string, string>;
  ipAddress?: string;
  userAgent?: string;
  locale?: string;
};

export async function getOrCreateConversation(
  ctx: TenantContext,
  input: StartConversationInput,
): Promise<ChatConversation> {
  const existing = await findOpenConversation(ctx, input.widgetId, input.visitorId);
  if (existing) return existing;

  const id = newId();
  await tenantDb(ctx).insert(chatConversations).values({
    id,
    widgetId: input.widgetId,
    siteId: input.siteId,
    visitorId: input.visitorId,
    pageUrl: input.pageUrl ?? null,
    referrer: input.referrer ?? null,
    utm: (input.utm ?? {}) as object,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    locale: input.locale ?? null,
  });

  const created = await getConversation(ctx, id);
  if (!created) throw new Error("chat_conversation_create_failed");
  return created;
}

/** The one open conversation for a visitor on a widget, if there is one. */
export async function findOpenConversation(
  ctx: TenantContext,
  widgetId: string,
  visitorId: string,
): Promise<ChatConversation | null> {
  const [row] = await tenantDb(ctx)
    .select(
      chatConversations,
      and(
        eq(chatConversations.widgetId, widgetId),
        eq(chatConversations.visitorId, visitorId),
        eq(chatConversations.status, "open"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getConversation(
  ctx: TenantContext,
  id: string,
): Promise<ChatConversation | null> {
  const [row] = await tenantDb(ctx)
    .select(chatConversations, eq(chatConversations.id, id))
    .limit(1);
  return row ?? null;
}

export async function listConversations(
  ctx: TenantContext,
  filters: { status?: "open" | "closed" } = {},
): Promise<ChatConversation[]> {
  const rows = await tenantDb(ctx).select(chatConversations);
  return rows
    .filter((row) => !filters.status || row.status === filters.status)
    .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
}

export async function listMessages(
  ctx: TenantContext,
  chatConversationId: string,
  since?: Date,
): Promise<ChatMessage[]> {
  const rows = await tenantDb(ctx).select(
    chatMessages,
    since
      ? and(
          eq(chatMessages.chatConversationId, chatConversationId),
          gte(chatMessages.createdAt, since),
        )
      : eq(chatMessages.chatConversationId, chatConversationId),
  );
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export type AppendMessageInput = {
  chatConversationId: string;
  direction: "in" | "out";
  author: "visitor" | "ai" | "agent" | "system";
  body: string;
  status?: "queued" | "sent" | "failed";
  sentByUserId?: string;
  aiReplyId?: string;
  error?: unknown;
};

export async function appendMessage(
  ctx: TenantContext,
  input: AppendMessageInput,
  now: Date = new Date(),
): Promise<ChatMessage | null> {
  const id = newId();
  await tenantDb(ctx).insert(chatMessages).values({
    id,
    chatConversationId: input.chatConversationId,
    direction: input.direction,
    author: input.author,
    body: input.body,
    status: input.status ?? "sent",
    sentByUserId: input.sentByUserId ?? null,
    aiReplyId: input.aiReplyId ?? null,
    error: (input.error ?? null) as object | null,
  });

  // An inbound message is what the rep's unread badge counts, and what the
  // "is anyone waiting" list sorts on. The counter is read-modify-written
  // rather than incremented in SQL, which is what the WhatsApp side does for
  // the same column and keeps the write inside tenantDb's typed `set`.
  const conversation = await getConversation(ctx, input.chatConversationId);
  await tenantDb(ctx)
    .update(chatConversations)
    .set(
      input.direction === "in"
        ? {
            lastMessageAt: now,
            lastVisitorMessageAt: now,
            unreadCount: (conversation?.unreadCount ?? 0) + 1,
            updatedAt: now,
          }
        : { lastMessageAt: now, updatedAt: now },
    )
    .where(eq(chatConversations.id, input.chatConversationId));

  const [row] = await tenantDb(ctx).select(chatMessages, eq(chatMessages.id, id)).limit(1);
  return row ?? null;
}

/**
 * Clears the unread badge, the way the WhatsApp inbox clears it when a rep
 * opens a thread. /chat renders every open conversation's transcript in
 * full, so opening the page *is* opening the thread — the badge is read
 * before it is cleared, so the rep still sees what was new on the load that
 * showed it to them.
 */
export async function markConversationRead(ctx: TenantContext, id: string): Promise<void> {
  await tenantDb(ctx)
    .update(chatConversations)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(eq(chatConversations.id, id));
}

export async function countVisitorMessages(
  ctx: TenantContext,
  chatConversationId: string,
): Promise<number> {
  const rows = await tenantDb(ctx).select(
    chatMessages,
    and(
      eq(chatMessages.chatConversationId, chatConversationId),
      eq(chatMessages.direction, "in"),
    ),
  );
  return rows.length;
}

/** The per-conversation kill switch, same semantics as WhatsApp's. */
export async function setConversationAiDisabled(
  ctx: TenantContext,
  id: string,
  disabled: boolean,
): Promise<void> {
  await tenantDb(ctx)
    .update(chatConversations)
    .set({ aiDisabledAt: disabled ? new Date() : null, updatedAt: new Date() })
    .where(eq(chatConversations.id, id));
}

export async function attachContact(
  ctx: TenantContext,
  id: string,
  contactId: string,
  leadSubmissionId: string,
): Promise<void> {
  await tenantDb(ctx)
    .update(chatConversations)
    .set({ contactId, leadSubmissionId, updatedAt: new Date() })
    .where(eq(chatConversations.id, id));
}

export async function assignConversation(
  ctx: TenantContext,
  id: string,
  userId: string | null,
): Promise<void> {
  await tenantDb(ctx)
    .update(chatConversations)
    .set({ assignedUserId: userId, updatedAt: new Date() })
    .where(eq(chatConversations.id, id));
}

export async function closeConversation(ctx: TenantContext, id: string): Promise<void> {
  await tenantDb(ctx)
    .update(chatConversations)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(chatConversations.id, id));
}
