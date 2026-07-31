"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/modules/tenancy/context";
import { sendText, sendTemplate } from "@/modules/whatsapp/send";
import { markConversationRead } from "@/modules/whatsapp/inbox";
import { deliverReply } from "@/modules/ai/reply";
import { markReplyDiscarded, setConversationAiEnabled } from "@/modules/ai/replies";

const sendTextSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().min(1).max(4096),
});

export async function sendTextAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const input = sendTextSchema.parse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });

  await sendText(ctx, input);
  revalidatePath(`/inbox/${input.conversationId}`);
}

// The picker submits "name|language" as one value — the pair is the
// template's identity (§6.4 sends require both), and keeping them in one
// option value avoids a second dependent <select>.
const sendTemplateSchema = z.object({
  conversationId: z.string().min(1),
  template: z.string().min(1).includes("|"),
});

export async function sendTemplateAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const input = sendTemplateSchema.parse({
    conversationId: formData.get("conversationId"),
    template: formData.get("template"),
  });

  const separator = input.template.lastIndexOf("|");
  await sendTemplate(ctx, {
    conversationId: input.conversationId,
    templateName: input.template.slice(0, separator),
    language: input.template.slice(separator + 1),
  });
  revalidatePath(`/inbox/${input.conversationId}`);
}

// --- AI auto-reply (PLAN.md §10 1O) --------------------------------------
// Approving a draft is a *send*, so it goes through modules/ai's deliverReply
// rather than sendText directly: that re-checks the window, the kill switch
// and the opt-out tag, all of which may have changed since the draft was
// written.

const replyIdSchema = z.object({
  replyId: z.string().min(1),
  conversationId: z.string().min(1),
});

export async function approveAiDraftAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const input = replyIdSchema.parse({
    replyId: formData.get("replyId"),
    conversationId: formData.get("conversationId"),
  });

  await deliverReply(ctx, input.replyId, ctx.userId);
  revalidatePath(`/inbox/${input.conversationId}`);
}

export async function discardAiDraftAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const input = replyIdSchema.parse({
    replyId: formData.get("replyId"),
    conversationId: formData.get("conversationId"),
  });

  await markReplyDiscarded(ctx, input.replyId, ctx.userId);
  revalidatePath(`/inbox/${input.conversationId}`);
}

/** Per-conversation kill switch — any agent can pull it, not admins only. */
export async function setConversationAiAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const conversationId = z.string().min(1).parse(formData.get("conversationId"));
  const enabled = formData.get("enabled") === "true";

  await setConversationAiEnabled(ctx, conversationId, enabled);
  revalidatePath(`/inbox/${conversationId}`);
}

export async function markReadAction(conversationId: string) {
  const ctx = await requireTenantContext();
  await markConversationRead(ctx, conversationId);
  revalidatePath("/inbox");
}
