import { eq } from "drizzle-orm";
import { aiReplies } from "@/db/schema";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// The two `ai_replies` writes the chat channel needs that the WhatsApp path
// doesn't express the same way: usage is stamped after generation (the row is
// created before the provider call, so a crash still leaves an audit trail),
// and "sent" here means rendered in the widget rather than accepted by Meta.

export async function updateReplyUsage(
  ctx: TenantContext,
  id: string,
  usage: {
    body: string;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
  },
): Promise<void> {
  await tenantDb(ctx)
    .update(aiReplies)
    .set({
      body: usage.body,
      provider: usage.provider,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      updatedAt: new Date(),
    })
    .where(eq(aiReplies.id, id));
}

export async function markReplySent(
  ctx: TenantContext,
  id: string,
  messageId?: string,
): Promise<void> {
  await tenantDb(ctx)
    .update(aiReplies)
    .set({ status: "sent", messageId: messageId ?? null, sentAt: new Date() })
    .where(eq(aiReplies.id, id));
}
