import { and, eq } from "drizzle-orm";
import { aiReplies } from "@/db/schema";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Drafts awaiting a rep in one chat conversation. The chat-channel twin of
// modules/ai/replies' `listPendingDrafts`, which filters on the WhatsApp
// `conversation_id` and therefore never sees a chat row — the two inboxes
// stay separate even though the table is shared.

export async function listPendingChatDrafts(ctx: TenantContext, chatConversationId: string) {
  const rows = await tenantDb(ctx).select(
    aiReplies,
    and(
      eq(aiReplies.chatConversationId, chatConversationId),
      eq(aiReplies.status, "draft"),
    ),
  );
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
