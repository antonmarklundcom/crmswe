import type { TenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";
import { normalizePhone } from "@/modules/crm/contacts";
import { DEFAULT_COUNTRY } from "@/lib/phone";
import { createActivity } from "@/modules/crm/activities";
import { recordLeadSubmission } from "@/modules/leads/submissions";
import { attachContact, getConversation, listMessages } from "./conversations";
import { chatEvents } from "./events";
import type { ChatWidget } from "./widgets";

// A visitor becomes a contact (docs/SPEC-CHAT-WIDGET.md §1.1).
//
// By exactly one route: `recordLeadSubmission()`, the §5.1 engine, with the
// widget's site id and its routing defaults. Chat is a *third lead entry
// path*, not a third lead model — the same reasoning that made a booking a
// contact rather than a new entity.

export type CaptureInput = {
  widget: ChatWidget;
  chatConversationId: string;
  name?: string;
  phone: string;
  email?: string;
};

export type CaptureResult = {
  contactId: string;
  dealId: string | null;
  alreadyCaptured: boolean;
};

export async function captureVisitor(
  ctx: TenantContext,
  input: CaptureInput,
): Promise<CaptureResult> {
  const conversation = await getConversation(ctx, input.chatConversationId);
  if (!conversation) throw new Error("chat_conversation_not_found");

  // Capturing twice must not open a second deal for the same chat — the
  // visitor correcting their phone number is a normal thing to do.
  if (conversation.contactId) {
    return { contactId: conversation.contactId, dealId: null, alreadyCaptured: true };
  }

  const tenant = await getTenant(ctx.tenantId);
  const settings = (tenant?.settings ?? {}) as TenantSettings;

  const transcript = await listMessages(ctx, conversation.id);
  const firstQuestion = transcript.find((message) => message.direction === "in")?.body ?? undefined;

  const lead = await recordLeadSubmission(ctx, {
    siteId: conversation.siteId,
    name: input.name,
    phone: normalizePhone(input.phone, settings.defaultCountry ?? DEFAULT_COUNTRY),
    email: input.email,
    message: firstQuestion ?? undefined,
    source: "chat",
    utm: (conversation.utm as Record<string, string> | null) ?? undefined,
    pageUrl: conversation.pageUrl ?? undefined,
    referrer: conversation.referrer ?? undefined,
    ipAddress: conversation.ipAddress ?? undefined,
    userAgent: conversation.userAgent ?? undefined,
    payload: { channel: "chat", chatConversationId: conversation.id },
    defaults: {
      pipelineId: input.widget.createDeal ? input.widget.defaultPipelineId : null,
      stageId: input.widget.createDeal ? input.widget.defaultStageId : null,
      ownerUserId: input.widget.defaultOwnerUserId,
      tagIds: (input.widget.defaultTagIds as string[] | null) ?? [],
      dealTitle: `Chat — ${input.name || input.phone}`,
    },
  });

  await attachContact(ctx, conversation.id, lead.contactId, lead.submissionId);

  // The transcript on the contact's timeline, so the rep sees what was asked
  // before they pick the thread up.
  await createActivity(ctx, {
    contactId: lead.contactId,
    dealId: lead.dealId ?? undefined,
    type: "chat",
    payload: {
      chatConversationId: conversation.id,
      widgetId: input.widget.id,
      transcript: transcript.map((message) => ({
        author: message.author,
        body: message.body,
        at: message.createdAt.toISOString(),
      })),
    },
  });

  await chatEvents.emit("chat.captured", {
    tenantId: ctx.tenantId,
    chatConversationId: conversation.id,
    widgetId: input.widget.id,
    siteId: conversation.siteId,
    contactId: lead.contactId,
    dealId: lead.dealId,
  });

  return { contactId: lead.contactId, dealId: lead.dealId, alreadyCaptured: false };
}
