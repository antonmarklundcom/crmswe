import { NextResponse } from "next/server";
import { getTenantContext } from "@/modules/tenancy/context";
import { listConversations } from "@/modules/whatsapp/inbox";
import { getContact } from "@/modules/crm/contacts";

// Backs the inbox list's 5s poll (PLAN.md §6.5). Session-authenticated,
// same-origin only — no API key path, unlike /api/v1/leads.
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conversations = await listConversations(ctx);
  const withContacts = await Promise.all(
    conversations.map(async (conversation) => {
      const contact = await getContact(ctx, conversation.contactId);
      return {
        id: conversation.id,
        contactId: conversation.contactId,
        contactName: contact?.name ?? conversation.contactId,
        contactPhone: contact?.phone ?? "",
        unreadCount: conversation.unreadCount,
        lastMessageAt: conversation.lastMessageAt,
      };
    }),
  );

  return NextResponse.json(
    { conversations: withContacts },
    { headers: { "Cache-Control": "no-store" } },
  );
}
