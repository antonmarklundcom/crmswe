import { and, eq } from "drizzle-orm";
import { conversations, messages } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Unified inbox read paths (PLAN.md §6.5). Sending goes through ./send.ts;
// this file is read-only (conversation list, message thread, mark-read).

export async function listConversations(ctx: TenantContext) {
  const rows = await tenantDb(ctx).select(conversations);
  return rows.sort((a, b) => {
    const at = a.lastMessageAt?.getTime() ?? 0;
    const bt = b.lastMessageAt?.getTime() ?? 0;
    return bt - at;
  });
}

/** Conversations belonging to one contact — the contact detail's
 * conversation tab, where the thread is shown in the contact's context
 * rather than the inbox's. */
export async function listConversationsForContact(ctx: TenantContext, contactId: string) {
  const rows = await tenantDb(ctx).select(conversations, eq(conversations.contactId, contactId));
  return rows.sort((a, b) => {
    const at = a.lastMessageAt?.getTime() ?? 0;
    const bt = b.lastMessageAt?.getTime() ?? 0;
    return bt - at;
  });
}

export async function getConversation(ctx: TenantContext, id: string) {
  const [row] = await tenantDb(ctx).select(conversations, eq(conversations.id, id));
  return row ?? null;
}

export async function listMessagesForConversation(ctx: TenantContext, conversationId: string) {
  const rows = await tenantDb(ctx).select(messages, eq(messages.conversationId, conversationId));
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function assignConversation(ctx: TenantContext, id: string, userId: string | null) {
  await tenantDb(ctx).update(conversations).set({ assignedUserId: userId }).where(eq(conversations.id, id));
}

export async function markConversationRead(ctx: TenantContext, id: string) {
  await tenantDb(ctx).update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, id));
}

/**
 * Outbound-first conversations (quote delivery, §8): a contact that has
 * never written to us has no conversation row yet. The new row gets
 * lastInboundAt = null, so the 24h window is correctly *closed* — sending
 * free-form to it fails, which is exactly Meta's rule, not a bug.
 */
export async function getOrCreateConversation(
  ctx: TenantContext,
  waAccountId: string,
  contactId: string,
) {
  const [existing] = await tenantDb(ctx).select(
    conversations,
    and(eq(conversations.waAccountId, waAccountId), eq(conversations.contactId, contactId)),
  );
  if (existing) return existing;

  const id = newId();
  await tenantDb(ctx)
    .insert(conversations)
    .values({ id, waAccountId, contactId, status: "open", unreadCount: 0 });

  const [created] = await tenantDb(ctx).select(conversations, eq(conversations.id, id));
  return created;
}

export function isWithinFreeFormWindow(lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - lastInboundAt.getTime() < 24 * 60 * 60 * 1000;
}
