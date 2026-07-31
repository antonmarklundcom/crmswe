import { eq } from "drizzle-orm";
import { leadSubmissions, quotes } from "@/db/schema";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import {
  listConversationsForContact,
  listMessagesForConversation,
} from "@/modules/whatsapp/inbox";
import { listActivitiesForContact, type ActivityType } from "./activities";

// Unified contact timeline (PLAN.md §5: "activities + WhatsApp messages +
// form submissions + quotes"). Until now the contact page showed activities
// only, so a rep opening a record could not see the conversation that
// produced it or the quote they sent — they had to go find both in other
// screens. This assembles the whole relationship in one ordered list.

export type TimelineEntry =
  | {
      kind: "activity";
      id: string;
      at: Date;
      activityType: ActivityType;
      text?: string;
    }
  | {
      kind: "message";
      id: string;
      at: Date;
      direction: "in" | "out";
      body: string | null;
      messageType: string;
      status: string | null;
      hasMedia: boolean;
    }
  | {
      kind: "quote";
      id: string;
      at: Date;
      number: string;
      status: string;
      total: number;
      currency: string;
    }
  | {
      kind: "lead";
      id: string;
      at: Date;
      siteId: string | null;
      campaign?: string;
      pageUrl: string | null;
    };

type Utm = { campaign?: string };

/**
 * Everything that ever happened with this contact, newest first.
 *
 * Assembled in memory from four tenant-scoped reads rather than a UNION: the
 * per-contact row counts are small, and each source already has a service
 * that applies the tenant predicate — reaching for raw SQL here would mean
 * rebuilding those guarantees by hand.
 */
export async function getContactTimeline(
  ctx: TenantContext,
  contactId: string,
): Promise<TimelineEntry[]> {
  const [activities, conversations, contactQuotes, leads] = await Promise.all([
    listActivitiesForContact(ctx, contactId),
    listConversationsForContact(ctx, contactId),
    tenantDb(ctx).select(quotes, eq(quotes.contactId, contactId)),
    tenantDb(ctx).select(leadSubmissions, eq(leadSubmissions.contactId, contactId)),
  ]);

  const messages = (
    await Promise.all(
      conversations.map((conversation) =>
        listMessagesForConversation(ctx, conversation.id),
      ),
    )
  ).flat();

  const entries: TimelineEntry[] = [
    ...activities.map(
      (activity): TimelineEntry => ({
        kind: "activity",
        id: activity.id,
        at: activity.createdAt,
        activityType: activity.type as ActivityType,
        text: (activity.payload as { text?: string })?.text,
      }),
    ),
    ...messages.map(
      (message): TimelineEntry => ({
        kind: "message",
        id: message.id,
        at: message.createdAt,
        direction: message.direction,
        body: message.body,
        messageType: message.type,
        status: message.status,
        hasMedia: Boolean(message.storageKey || message.mediaId),
      }),
    ),
    ...contactQuotes.map(
      (quote): TimelineEntry => ({
        kind: "quote",
        id: quote.id,
        at: quote.createdAt,
        number: quote.number,
        status: quote.status,
        total: quote.total,
        currency: quote.currency,
      }),
    ),
    ...leads.map(
      (lead): TimelineEntry => ({
        kind: "lead",
        id: lead.id,
        at: lead.createdAt,
        siteId: lead.siteId,
        campaign: (lead.utm as Utm | null)?.campaign,
        pageUrl: lead.pageUrl,
      }),
    ),
  ];

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}
