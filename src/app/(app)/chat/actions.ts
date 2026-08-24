"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantAdmin, requireTenantContext } from "@/modules/tenancy/context";
import {
  createChatWidget,
  getChatWidget,
  rotateWidgetKey,
  updateChatWidget,
  ChatWidgetError,
} from "@/modules/chatwidget/widgets";
import {
  appendMessage,
  assignConversation,
  closeConversation,
  setConversationAiDisabled,
} from "@/modules/chatwidget/conversations";
import { markReplyDiscarded } from "@/modules/ai/replies";
import { markReplySent } from "@/modules/chatwidget/usage";
import { getReply } from "@/modules/ai/replies";

// Widget configuration is admin-only (tenant configuration, §3.2); replying
// in a conversation is ordinary agent work, like the WhatsApp inbox.

export type FormState = { error: string | null; values: Record<string, string> };
const empty: FormState = { error: null, values: {} };

const widgetSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1).max(200),
  mode: z.enum(["off", "draft", "send"]).optional(),
  greeting: z.string().max(500).optional(),
  primaryColor: z.string().max(20).optional(),
  systemPrompt: z.string().max(5000).optional(),
  neverPromise: z.string().max(2000).optional(),
  askForPhone: z.coerce.boolean().optional(),
  captureAfterMessages: z.coerce.number().int().min(1).max(20).optional(),
  createDeal: z.coerce.boolean().optional(),
  maxRepliesPerConversationPerDay: z.coerce.number().int().min(0).max(60).optional(),
  allowedOrigins: z.string().max(2000).optional(),
});

function readWidgetForm(formData: FormData) {
  return {
    siteId: String(formData.get("siteId") ?? ""),
    name: String(formData.get("name") ?? ""),
    mode: (formData.get("mode") ?? undefined) as "off" | "draft" | "send" | undefined,
    greeting: String(formData.get("greeting") ?? ""),
    primaryColor: String(formData.get("primaryColor") ?? ""),
    systemPrompt: String(formData.get("systemPrompt") ?? ""),
    neverPromise: String(formData.get("neverPromise") ?? ""),
    askForPhone: formData.get("askForPhone") === "on",
    captureAfterMessages: Number(formData.get("captureAfterMessages") ?? 2),
    createDeal: formData.get("createDeal") === "on",
    maxRepliesPerConversationPerDay: Number(
      formData.get("maxRepliesPerConversationPerDay") ?? 0,
    ),
    allowedOrigins: String(formData.get("allowedOrigins") ?? ""),
  };
}

function toInput(parsed: z.infer<typeof widgetSchema>) {
  return {
    siteId: parsed.siteId,
    name: parsed.name,
    mode: parsed.mode,
    greeting: parsed.greeting || null,
    primaryColor: parsed.primaryColor || null,
    systemPrompt: parsed.systemPrompt || null,
    neverPromise: parsed.neverPromise || null,
    askForPhone: parsed.askForPhone,
    captureAfterMessages: parsed.captureAfterMessages,
    createDeal: parsed.createDeal,
    maxRepliesPerConversationPerDay: parsed.maxRepliesPerConversationPerDay || null,
    allowedOrigins: (parsed.allowedOrigins ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

export async function createWidgetAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenantAdmin();
  const values = readWidgetForm(formData);
  const parsed = widgetSchema.safeParse(values);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      error: field === "siteId" ? "siteRequired" : "nameRequired",
      values: { name: values.name, siteId: values.siteId },
    };
  }

  try {
    await createChatWidget(ctx, toInput(parsed.data));
  } catch (error) {
    if (error instanceof ChatWidgetError && error.code === "exists") {
      return { error: "exists", values: { name: values.name, siteId: values.siteId } };
    }
    throw error;
  }

  revalidatePath("/chat");
  return empty;
}

export async function updateWidgetAction(
  widgetId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenantAdmin();
  const values = readWidgetForm(formData);
  const parsed = widgetSchema.safeParse(values);
  if (!parsed.success) return { error: "nameRequired", values: { name: values.name } };

  await updateChatWidget(ctx, widgetId, toInput(parsed.data));
  revalidatePath("/chat");
  return empty;
}

export async function rotateWidgetKeyAction(widgetId: string): Promise<void> {
  const ctx = await requireTenantAdmin();
  await rotateWidgetKey(ctx, widgetId);
  revalidatePath("/chat");
}

export async function replyInChatAction(
  conversationId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenantContext();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return empty;

  await appendMessage(ctx, {
    chatConversationId: conversationId,
    direction: "out",
    author: "agent",
    body,
    sentByUserId: ctx.userId,
  });
  // Answering by hand claims the thread, the same way the WhatsApp inbox
  // treats a reply (§10 1U).
  await assignConversation(ctx, conversationId, ctx.userId);

  revalidatePath("/chat");
  return empty;
}

/**
 * Approving an AI draft. Deliberately re-reads the row rather than trusting
 * the page: a draft written minutes ago may since have been discarded, and
 * the kill switch may have been hit.
 */
export async function approveDraftAction(replyId: string): Promise<void> {
  const ctx = await requireTenantContext();
  const reply = await getReply(ctx, replyId);
  if (!reply || reply.status !== "draft" || !reply.body || !reply.chatConversationId) return;

  const message = await appendMessage(ctx, {
    chatConversationId: reply.chatConversationId,
    direction: "out",
    author: "ai",
    body: reply.body,
    sentByUserId: ctx.userId,
    aiReplyId: reply.id,
  });
  await markReplySent(ctx, reply.id, message?.id);
  revalidatePath("/chat");
}

export async function discardDraftAction(replyId: string): Promise<void> {
  const ctx = await requireTenantContext();
  await markReplyDiscarded(ctx, replyId, ctx.userId);
  revalidatePath("/chat");
}

export async function toggleChatAiAction(
  conversationId: string,
  disabled: boolean,
): Promise<void> {
  const ctx = await requireTenantContext();
  await setConversationAiDisabled(ctx, conversationId, disabled);
  revalidatePath("/chat");
}

export async function closeChatAction(conversationId: string): Promise<void> {
  const ctx = await requireTenantContext();
  await closeConversation(ctx, conversationId);
  revalidatePath("/chat");
}

export async function getWidgetAction(widgetId: string) {
  const ctx = await requireTenantAdmin();
  return getChatWidget(ctx, widgetId);
}
