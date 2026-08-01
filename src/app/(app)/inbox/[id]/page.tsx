import { notFound } from "next/navigation";
import { requireTenantContext } from "@/modules/tenancy/context";
import {
  getConversation,
  listMessagesForConversation,
  markConversationRead,
  isWithinFreeFormWindow,
} from "@/modules/whatsapp/inbox";
import { getContact } from "@/modules/crm/contacts";
import { listApprovedTemplates } from "@/modules/whatsapp/templates";
import { listPendingDrafts } from "@/modules/ai/replies";
import { ConversationView, type ConversationData } from "./ConversationView";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();

  const conversation = await getConversation(ctx, id);
  if (!conversation) notFound();

  const [contact, messages, templates, aiDrafts] = await Promise.all([
    getContact(ctx, conversation.contactId),
    listMessagesForConversation(ctx, id),
    listApprovedTemplates(ctx, conversation.waAccountId),
    listPendingDrafts(ctx, id),
  ]);

  if (conversation.unreadCount > 0) {
    await markConversationRead(ctx, id);
  }

  const initial: ConversationData = {
    contact: contact ? { name: contact.name, phone: contact.phone } : null,
    conversation: {
      id: conversation.id,
      lastInboundAt: conversation.lastInboundAt ? conversation.lastInboundAt.toISOString() : null,
      aiDisabledAt: conversation.aiDisabledAt ? conversation.aiDisabledAt.toISOString() : null,
    },
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction as "in" | "out",
      body: m.body,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    })),
    templates: templates.map((t) => ({ id: t.id, name: t.name, language: t.language })),
    aiDrafts: aiDrafts.map((d) => ({
      id: d.id,
      body: d.body,
      provider: d.provider,
      model: d.model,
      promptTokens: d.promptTokens,
      completionTokens: d.completionTokens,
    })),
    windowOpen: isWithinFreeFormWindow(conversation.lastInboundAt),
  };

  return <ConversationView conversationId={id} initial={initial} />;
}
