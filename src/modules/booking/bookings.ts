import { randomBytes } from "node:crypto";
import { and, eq, gt, lt, inArray } from "drizzle-orm";
import { bookingResources, bookings, calendarEvents } from "@/db/schema";
import { newId } from "@/lib/ids";
import { enqueue } from "@/lib/queue";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb, tenantTransaction } from "@/modules/tenancy/db";
import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";
import { createActivity } from "@/modules/crm/activities";
import { getContact } from "@/modules/crm/contacts";
import { recordLeadSubmission, type LeadUtm } from "@/modules/leads/submissions";
import { dayKeyOf, addDays, type DayKey } from "@/modules/calendar/zoned-time";
import {
  listAvailabilityRulesForResources,
  listBlackouts,
  getResource,
  listResourcesForType,
  type BookingResource,
} from "./resources";
import { generateSlots, pickResource, type BusyInterval, type Slot } from "./slots";
import {
  getBookingType,
  resolveBookingTypeSettings,
  slotConfigOf,
  type BookingType,
} from "./types";
import { bookingEvents } from "./events";

// Reserving, cancelling, rescheduling (docs/SPEC-BOOKING.md §1, §3).
//
// One public booking writes a contact (through the same engine lead ingest
// uses), a calendar_events row so the agenda sees it with no sync job, and a
// bookings row carrying the lifecycle the calendar has no business knowing
// about.

export type Booking = typeof bookings.$inferSelect;

export const BOOKING_REMINDER_JOB_TYPE = "booking.reminder";

export class BookingError extends Error {
  constructor(
    readonly code:
      | "notFound"
      | "inactive"
      | "slotTaken"
      | "slotUnavailable"
      | "cutoffPassed"
      | "alreadyCancelled",
  ) {
    super(`booking_${code}`);
  }
}

export type ReserveInput = {
  bookingTypeId: string;
  startsAt: Date;
  name: string;
  phone: string;
  email?: string;
  message?: string;
  answers?: Record<string, unknown>;
  utm?: LeadUtm;
  pageUrl?: string;
  referrer?: string;
  ipAddress?: string;
  userAgent?: string;
  source?: string;
};

export type ReserveResult = {
  booking: Booking;
  contactId: string;
  dealId: string | null;
};

function slotKey(resourceId: string, startsAt: Date): string {
  return `${resourceId}:${Math.floor(startsAt.getTime() / 1000)}`;
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Busy time for a set of resources.
 *
 * Two sources, unioned: the resource's own confirmed bookings, and — for a
 * resource that *is* a rep — every `calendar_events` row on their agenda,
 * booking-produced or not. The second half is the point of writing bookings
 * to the calendar at all: a rep's own 15:00 site visit has to make 15:00
 * unbookable, with no sync job in either direction.
 */
export async function busyFor(
  ctx: TenantContext,
  resources: BookingResource[],
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  if (resources.length === 0) return [];

  const bookingRows = await tenantDb(ctx).select(
    bookings,
    and(
      inArray(
        bookings.resourceId,
        resources.map((resource) => resource.id),
      ),
      eq(bookings.status, "confirmed"),
      lt(bookings.startsAt, to),
      gt(bookings.endsAt, from),
    ),
  );

  const intervals: BusyInterval[] = bookingRows.map((row) => ({
    resourceId: row.resourceId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  }));

  const userResources = resources.filter((resource) => resource.kind === "user" && resource.userId);
  if (userResources.length > 0) {
    const events = await tenantDb(ctx).select(
      calendarEvents,
      and(
        inArray(
          calendarEvents.assignedUserId,
          userResources.map((resource) => resource.userId!),
        ),
        lt(calendarEvents.startsAt, to),
        gt(calendarEvents.endsAt, from),
      ),
    );
    for (const event of events) {
      const resource = userResources.find((candidate) => candidate.userId === event.assignedUserId);
      if (!resource) continue;
      intervals.push({
        resourceId: resource.id,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      });
    }
  }

  return intervals;
}

/** Everything the pure generator needs, gathered for one type and window. */
export async function availableSlots(
  ctx: TenantContext,
  type: BookingType,
  from: DayKey,
  to: DayKey,
  now: Date = new Date(),
): Promise<Slot[]> {
  const tenant = await getTenant(ctx.tenantId);
  if (!tenant) return [];
  const timeZone = tenant.timezone;
  const settings = (tenant.settings ?? {}) as TenantSettings;

  const resources = await listResourcesForType(ctx, type.id);
  if (resources.length === 0) return [];

  const rules = await listAvailabilityRulesForResources(
    ctx,
    resources.map((resource) => resource.id),
  );

  // Widen the busy/blackout window by a day on each side so an event that
  // merely overlaps the edge still blocks the edge slot.
  const windowFrom = new Date(`${addDays(from, -1)}T00:00:00Z`);
  const windowTo = new Date(`${addDays(to, 2)}T00:00:00Z`);

  const [busy, blackouts] = await Promise.all([
    busyFor(ctx, resources, windowFrom, windowTo),
    listBlackouts(ctx, windowFrom, windowTo),
  ]);

  return generateSlots({
    timeZone,
    from,
    to,
    type: slotConfigOf(type),
    rules: rules.map((rule) => ({
      resourceId: rule.resourceId,
      weekday: rule.weekday,
      start: rule.startTime,
      end: rule.endTime,
    })),
    businessHours: settings.businessHours ?? null,
    busy,
    blackouts: blackouts.map((row) => ({
      resourceId: row.resourceId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    })),
    now,
  });
}

/**
 * Reserve a slot.
 *
 * The contact is upserted *before* the slot transaction, deliberately. If the
 * visitor then loses the race for the slot they still exist in the CRM as
 * someone who tried to book — which is the outcome the owner wants, and the
 * opposite of the silence §5.2.4 exists to end.
 */
export async function reserveBooking(
  ctx: TenantContext,
  input: ReserveInput,
  now: Date = new Date(),
): Promise<ReserveResult> {
  const type = await getBookingType(ctx, input.bookingTypeId);
  if (!type) throw new BookingError("notFound");
  if (!type.isActive) throw new BookingError("inactive");

  const tenant = await getTenant(ctx.tenantId);
  if (!tenant) throw new BookingError("notFound");
  const timeZone = tenant.timezone;
  const day = dayKeyOf(input.startsAt, timeZone);

  // Authoritative availability: the offered slot is re-derived server-side.
  // A start time posted by hand that was never on offer is refused here, not
  // trusted because it arrived in the body.
  const slots = await availableSlots(ctx, type, day, day, now);
  const slot = slots.find((candidate) => candidate.startsAt.getTime() === input.startsAt.getTime());
  if (!slot) throw new BookingError("slotUnavailable");

  const load = await bookingsPerResourceOn(ctx, slot.resourceIds, input.startsAt, timeZone);
  const resourceId = pickResource(type.assignment, slot.resourceIds, load);
  if (!resourceId) throw new BookingError("slotUnavailable");

  const resource = await getResource(ctx, resourceId);
  if (!resource) throw new BookingError("slotUnavailable");

  const settings = resolveBookingTypeSettings(type.settings as never);
  const endsAt = new Date(input.startsAt.getTime() + type.durationMinutes * 60_000);

  const lead = await recordLeadSubmission(ctx, {
    bookingTypeId: type.id,
    name: input.name,
    phone: input.phone,
    email: input.email,
    message: input.message,
    source: input.source || "booking",
    utm: input.utm,
    pageUrl: input.pageUrl,
    referrer: input.referrer,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    payload: { ...(input.answers ?? {}), startsAt: input.startsAt.toISOString() },
    defaults: {
      pipelineId: type.createDeal ? type.defaultPipelineId : null,
      stageId: type.createDeal ? type.defaultStageId : null,
      ownerUserId: type.defaultOwnerUserId,
      tagIds: (type.defaultTagIds as string[] | null) ?? [],
      dealTitle: `${type.name} — ${input.name}`,
    },
  });

  const bookingId = newId();
  const eventId = newId();
  const token = newToken();

  await tenantTransaction(ctx, async (tx) => {
    // Serialise every reserve for this resource against every other one, by
    // locking a row that always exists: the resource itself.
    //
    // The FOR UPDATE over `bookings` below cannot do that on its own. On a
    // day with no committed bookings in range it matches nothing, so InnoDB
    // takes only gap locks — which are *compatible* with each other. Two
    // partially-overlapping reserves both read an empty set, both pass the
    // clash check, and then deadlock on the inserts: a 500 where a 409 was
    // designed. A real record lock on `booking_resources` is what makes the
    // read-then-write actually atomic per resource.
    await tx.selectForUpdate(bookingResources, eq(bookingResources.id, resourceId));

    // Lock the resource's live bookings for the day, then re-check overlap.
    // The unique index on active_slot is the backstop for the identical-start
    // double-click; this is what catches genuine partial overlap.
    const dayStart = new Date(input.startsAt.getTime() - 24 * 60 * 60_000);
    const dayEnd = new Date(input.startsAt.getTime() + 24 * 60 * 60_000);
    const live = await tx.selectForUpdate(
      bookings,
      and(
        eq(bookings.resourceId, resourceId),
        eq(bookings.status, "confirmed"),
        lt(bookings.startsAt, dayEnd),
        gt(bookings.endsAt, dayStart),
      ),
    );

    const clash = live.some(
      (row) => row.startsAt < endsAt && input.startsAt < row.endsAt,
    );
    if (clash) throw new BookingError("slotTaken");

    await tx.insert(calendarEvents).values({
      id: eventId,
      title: `${type.name} — ${input.name}`,
      description: input.message ?? null,
      startsAt: input.startsAt,
      endsAt,
      allDay: false,
      location: type.locationDetail ?? null,
      contactId: lead.contactId,
      dealId: lead.dealId,
      // A rep's booking lands on their agenda; a room's lands on the
      // business's, which is what a null assignee already means (§ calendar).
      assignedUserId: resource.userId,
      createdByUserId: ctx.userId,
    });

    await tx.insert(bookings).values({
      id: bookingId,
      bookingTypeId: type.id,
      resourceId,
      contactId: lead.contactId,
      calendarEventId: eventId,
      dealId: lead.dealId,
      leadSubmissionId: lead.submissionId,
      startsAt: input.startsAt,
      endsAt,
      status: "confirmed",
      publicToken: token,
      answers: input.answers ?? {},
      source: input.source || "booking",
      utm: (input.utm ?? {}) as object,
      pageUrl: input.pageUrl ?? null,
      referrer: input.referrer ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      activeSlot: slotKey(resourceId, input.startsAt),
    });
  }).catch((error: unknown) => {
    // The unique index fired: someone took this exact start between the read
    // and the write. That is a 409 to the visitor, not a 500.
    if (isDuplicateSlot(error)) throw new BookingError("slotTaken");
    throw error;
  });

  const booking = await getBooking(ctx, bookingId);
  if (!booking) throw new BookingError("notFound");

  await createActivity(ctx, {
    contactId: lead.contactId,
    dealId: lead.dealId ?? undefined,
    type: "booking",
    payload: {
      bookingId,
      bookingTypeId: type.id,
      startsAt: input.startsAt.toISOString(),
      status: "confirmed",
    },
  });

  if (settings.reminderMinutes) {
    const runAt = new Date(input.startsAt.getTime() - settings.reminderMinutes * 60_000);
    if (runAt.getTime() > now.getTime()) {
      const jobId = await enqueue(
        BOOKING_REMINDER_JOB_TYPE,
        { tenantId: ctx.tenantId, bookingId },
        { tenantId: ctx.tenantId, runAt },
      );
      await tenantDb(ctx)
        .update(bookings)
        .set({ reminderJobId: jobId })
        .where(eq(bookings.id, bookingId));
    }
  }

  await bookingEvents.emit("booking.created", {
    tenantId: ctx.tenantId,
    bookingId,
    bookingTypeId: type.id,
    contactId: lead.contactId,
    resourceId,
    startsAt: input.startsAt,
  });

  return { booking, contactId: lead.contactId, dealId: lead.dealId };
}

/**
 * The three ways MySQL says "someone else got there first" on this path.
 *
 * `ER_DUP_ENTRY` is the unique index on `active_slot` firing for an
 * identical start. The other two are the lock above doing its job under
 * contention: a loser rolled back by the deadlock detector, or one that
 * waited out `innodb_lock_wait_timeout`. All three mean the same thing to
 * the visitor — the slot went — and all three are a 409, never a 500.
 */
function isDuplicateSlot(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return (
    code === "ER_DUP_ENTRY" ||
    code === "ER_LOCK_DEADLOCK" ||
    code === "ER_LOCK_WAIT_TIMEOUT"
  );
}

async function bookingsPerResourceOn(
  ctx: TenantContext,
  resourceIds: string[],
  startsAt: Date,
  timeZone: string,
): Promise<Map<string, number>> {
  const day = dayKeyOf(startsAt, timeZone);
  const from = new Date(startsAt.getTime() - 36 * 60 * 60_000);
  const to = new Date(startsAt.getTime() + 36 * 60 * 60_000);
  const rows = await tenantDb(ctx).select(
    bookings,
    and(
      inArray(bookings.resourceId, resourceIds),
      eq(bookings.status, "confirmed"),
      gt(bookings.startsAt, from),
      lt(bookings.startsAt, to),
    ),
  );

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (dayKeyOf(row.startsAt, timeZone) !== day) continue;
    counts.set(row.resourceId, (counts.get(row.resourceId) ?? 0) + 1);
  }
  return counts;
}

export async function getBooking(ctx: TenantContext, id: string): Promise<Booking | null> {
  const [row] = await tenantDb(ctx).select(bookings, eq(bookings.id, id)).limit(1);
  return row ?? null;
}

export async function listBookings(
  ctx: TenantContext,
  filters: { from?: Date; to?: Date; status?: Booking["status"]; contactId?: string } = {},
): Promise<Booking[]> {
  const rows = await tenantDb(ctx).select(bookings);
  return rows
    .filter((row) => {
      if (filters.from && row.endsAt <= filters.from) return false;
      if (filters.to && row.startsAt >= filters.to) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (filters.contactId && row.contactId !== filters.contactId) return false;
      return true;
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Cancel. Frees the slot (`active_slot` → NULL, so the unique index stops
 * holding it) and deletes the agenda row — the calendar should not show
 * cancelled things — while this row keeps who, when and why.
 */
export async function cancelBooking(
  ctx: TenantContext,
  id: string,
  by: "contact" | "staff" | "system",
  reason?: string,
  now: Date = new Date(),
): Promise<Booking | null> {
  const booking = await getBooking(ctx, id);
  if (!booking) throw new BookingError("notFound");
  if (booking.status === "cancelled") throw new BookingError("alreadyCancelled");

  if (by === "contact") {
    const type = await getBookingType(ctx, booking.bookingTypeId);
    const settings = resolveBookingTypeSettings(type?.settings as never);
    const cutoff = booking.startsAt.getTime() - settings.cancellationCutoffMinutes * 60_000;
    // A hard cutoff is what stops an 08:55 cancellation for a 09:00 slot.
    // Staff can always cancel; only the visitor's own link is bounded.
    if (now.getTime() > cutoff) throw new BookingError("cutoffPassed");
  }

  await tenantDb(ctx)
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: by,
      cancelReason: reason ?? null,
      activeSlot: null,
      calendarEventId: null,
      updatedAt: now,
    })
    .where(eq(bookings.id, id));

  if (booking.calendarEventId) {
    await tenantDb(ctx).delete(calendarEvents, eq(calendarEvents.id, booking.calendarEventId));
  }

  await createActivity(ctx, {
    contactId: booking.contactId,
    dealId: booking.dealId ?? undefined,
    type: "booking",
    payload: {
      bookingId: id,
      status: "cancelled",
      cancelledBy: by,
      startsAt: booking.startsAt.toISOString(),
    },
  });

  await bookingEvents.emit("booking.cancelled", {
    tenantId: ctx.tenantId,
    bookingId: id,
    bookingTypeId: booking.bookingTypeId,
    contactId: booking.contactId,
    resourceId: booking.resourceId,
    startsAt: booking.startsAt,
    cancelledBy: by,
  });

  return getBooking(ctx, id);
}

/**
 * Reschedule is cancel + create, linked by `rescheduled_from_id` — a chain
 * rather than a mutated row, so "it was moved twice" is answerable.
 */
export async function rescheduleBooking(
  ctx: TenantContext,
  id: string,
  startsAt: Date,
  by: "contact" | "staff",
  now: Date = new Date(),
): Promise<ReserveResult> {
  const original = await getBooking(ctx, id);
  if (!original) throw new BookingError("notFound");

  const type = await getBookingType(ctx, original.bookingTypeId);
  if (!type) throw new BookingError("notFound");

  const contact = await contactOf(ctx, original.contactId);

  // Check the new slot is actually on offer *before* cancelling the old one.
  // Cancel-first is what makes the chain honest, but on its own it means a
  // visitor whose chosen time went while their page was open loses the
  // booking they had and gets nothing — the one outcome a reschedule must
  // never produce. Skipped when the new slot overlaps the booking being
  // moved (a fifteen-minute nudge), since there the booking blocks itself.
  const endsAt = new Date(startsAt.getTime() + type.durationMinutes * 60_000);
  const overlapsItself = startsAt < original.endsAt && endsAt > original.startsAt;
  if (!overlapsItself) {
    const tenant = await getTenant(ctx.tenantId);
    const day = dayKeyOf(startsAt, tenant?.timezone ?? "UTC");
    const offered = await availableSlots(ctx, type, day, day, now);
    if (!offered.some((slot) => slot.startsAt.getTime() === startsAt.getTime())) {
      throw new BookingError("slotUnavailable");
    }
  }

  await cancelBooking(ctx, id, by, "rescheduled", now);

  const result = await reserveBooking(
    ctx,
    {
      bookingTypeId: original.bookingTypeId,
      startsAt,
      name: contact.name,
      phone: contact.phone,
      email: contact.email ?? undefined,
      answers: (original.answers as Record<string, unknown> | null) ?? undefined,
      source: original.source ?? "booking",
    },
    now,
  );

  await tenantDb(ctx)
    .update(bookings)
    .set({ rescheduledFromId: id })
    .where(eq(bookings.id, result.booking.id));

  return { ...result, booking: (await getBooking(ctx, result.booking.id))! };
}

async function contactOf(ctx: TenantContext, contactId: string) {
  const contact = await getContact(ctx, contactId);
  if (!contact) throw new BookingError("notFound");
  return contact;
}

/**
 * No-show is always a human's call. Nothing in the system knows the customer
 * didn't turn up, and auto-marking would quietly libel people.
 */
export async function markNoShow(ctx: TenantContext, id: string): Promise<Booking | null> {
  const booking = await getBooking(ctx, id);
  if (!booking) throw new BookingError("notFound");

  await tenantDb(ctx)
    .update(bookings)
    .set({ status: "no_show", activeSlot: null, updatedAt: new Date() })
    .where(eq(bookings.id, id));

  await createActivity(ctx, {
    contactId: booking.contactId,
    dealId: booking.dealId ?? undefined,
    type: "booking",
    payload: { bookingId: id, status: "no_show", startsAt: booking.startsAt.toISOString() },
  });

  await bookingEvents.emit("booking.no_show", {
    tenantId: ctx.tenantId,
    bookingId: id,
    bookingTypeId: booking.bookingTypeId,
    contactId: booking.contactId,
    resourceId: booking.resourceId,
    startsAt: booking.startsAt,
  });

  return getBooking(ctx, id);
}

export async function markCompleted(ctx: TenantContext, id: string): Promise<Booking | null> {
  await tenantDb(ctx)
    .update(bookings)
    .set({ status: "completed", activeSlot: null, updatedAt: new Date() })
    .where(eq(bookings.id, id));
  return getBooking(ctx, id);
}
