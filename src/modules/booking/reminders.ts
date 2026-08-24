import { eq } from "drizzle-orm";
import { bookings } from "@/db/schema";
import { buildSystemTenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { getContact } from "@/modules/crm/contacts";
import { getTenant } from "@/modules/tenancy/tenants";
import { formatDateTime } from "@/lib/i18n/format";
import { isWithinFreeFormWindow, listConversationsForContact } from "@/modules/whatsapp/inbox";
import { sendText } from "@/modules/whatsapp/send";
import { getBooking } from "./bookings";
import { getBookingType } from "./types";

// The booking reminder (docs/SPEC-BOOKING.md §7). A job, not a cron: it is
// scheduled per booking with a future `run_at`, which is exactly what §2.1
// says a delayed step is.
//
// It sends through modules/whatsapp/send.ts and therefore inherits the 24h
// window rules unmodified — nothing here reimplements that check.
//
// KNOWN LIMIT, stated rather than papered over: a visitor who booked on the
// website has usually never messaged the business, so there is no open 24h
// window and the reminder is *skipped*. Reaching that person needs a
// Meta-approved template (§6.4), which is real work with a Meta review cycle
// attached and is deliberately not in this first cut. Today the reminder
// serves the case that already works — a contact who is mid-conversation —
// and never fails a booking when it can't.

export type ReminderPayload = { tenantId: string; bookingId: string };

export type ReminderOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: "not_found" | "not_confirmed" | "already_sent" | "no_whatsapp" };

export async function sendBookingReminder(payload: ReminderPayload): Promise<ReminderOutcome> {
  const ctx = await buildSystemTenantContext(payload.tenantId);
  if (!ctx) return { status: "skipped", reason: "not_found" };

  const booking = await getBooking(ctx, payload.bookingId);
  if (!booking) return { status: "skipped", reason: "not_found" };
  // A cancelled or rescheduled booking must not remind: the job survives the
  // cancellation deliberately (so "why did they get a reminder for a
  // cancelled visit" is answerable), and the guard lives here.
  if (booking.status !== "confirmed") return { status: "skipped", reason: "not_confirmed" };
  if (booking.reminderSentAt) return { status: "skipped", reason: "already_sent" };

  const [contact, type, tenant] = await Promise.all([
    getContact(ctx, booking.contactId),
    getBookingType(ctx, booking.bookingTypeId),
    getTenant(ctx.tenantId),
  ]);
  if (!contact || !type || !tenant) return { status: "skipped", reason: "not_found" };

  const when = formatDateTime(booking.startsAt, tenant.locale, tenant.timezone);
  const body = buildReminderText({
    contactName: contact.name,
    typeName: type.name,
    when,
    businessName: tenant.name,
    location: type.locationDetail,
  });

  // Existing conversations only — a reminder must never *open* a thread it
  // then can't legally send into.
  const conversations = await listConversationsForContact(ctx, contact.id);
  const conversation = conversations.find((row) => isWithinFreeFormWindow(row.lastInboundAt));
  if (!conversation) return { status: "skipped", reason: "no_whatsapp" };

  try {
    await sendText(ctx, { conversationId: conversation.id, body });
  } catch {
    // Skipped, never failed: a reminder that cannot be delivered must not
    // dead-letter a job or cast doubt on a booking that still stands.
    return { status: "skipped", reason: "no_whatsapp" };
  }

  await tenantDb(ctx)
    .update(bookings)
    .set({ reminderSentAt: new Date() })
    .where(eq(bookings.id, booking.id));

  return { status: "sent" };
}

/** Pure, so the copy is testable without a WhatsApp account. */
export function buildReminderText(input: {
  contactName: string;
  typeName: string;
  when: string;
  businessName: string;
  location?: string | null;
}): string {
  const lines = [
    `Hola ${input.contactName}, te recordamos tu ${input.typeName} en ${input.businessName}.`,
    `📅 ${input.when}`,
  ];
  if (input.location) lines.push(`📍 ${input.location}`);
  return lines.join("\n");
}
