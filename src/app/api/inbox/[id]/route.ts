import { NextResponse } from "next/server";
import { getTenantContext } from "@/modules/tenancy/context";
import {
  getConversation,
  listMessagesForConversation,
  markConversationRead,
  isWithinFreeFormWindow,
} from "@/modules/whatsapp/inbox";
import { getContact } from "@/modules/crm/contacts";
import { listApprovedTemplates } from "@/modules/whatsapp/templates";
import { listPendingDrafts } from "@/modules/ai/replies";

// Backs the conversation thread's 5s poll (PLAN.md §6.5). Marking read is
// best-effort here: a grace/locked tenant can still view the thread (the
// write path is what's gated, per modules/tenancy/db.ts), so a failed
// mark-read must not turn a read into a 500.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conversation = await getConversation(ctx, id);
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [contact, messages, templates, aiDrafts] = await Promise.all([
    getContact(ctx, conversation.contactId),
    listMessagesForConversation(ctx, id),
    listApprovedTemplates(ctx, conversation.waAccountId),
    listPendingDrafts(ctx, id),
  ]);

  if (conversation.unreadCount > 0) {
    await markConversationRead(ctx, id).catch(() => {});
  }

  return NextResponse.json(
    {
      conversation: {
        id: conversation.id,
        lastInboundAt: conversation.lastInboundAt,
        aiDisabledAt: conversation.aiDisabledAt,
      },
      contact: contact ? { name: contact.name, phone: contact.phone } : null,
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        status: m.status,
        createdAt: m.createdAt,
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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
