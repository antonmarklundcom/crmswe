import { and, eq, gt, lt, type SQL } from "drizzle-orm";
import { calendarEvents } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// The agenda's service layer. Everything the calendar pages do goes through
// here, and nothing here touches a request: the pages resolve the tenant, this
// resolves the data (§2.2's module rule).

export type CalendarEvent = typeof calendarEvents.$inferSelect;

export type CalendarEventInput = {
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay?: boolean;
  location?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  assignedUserId?: string | null;
};

export class CalendarEventError extends Error {
  constructor(readonly code: "notFound" | "forbidden" | "invalidRange") {
    super(`calendar_event_${code}`);
  }
}

/**
 * Who may change an event.
 *
 * The calendar is shared — everyone in the business sees everything, as they
 * do the pipeline (§1.2) — but "shared" is not the same as "anyone may delete
 * your Tuesday". An agent edits what they created or what was put on their
 * own agenda; an admin edits anything, because somebody has to be able to
 * clear the calendar of a rep who left.
 */
export function canModifyEvent(ctx: TenantContext, event: CalendarEvent): boolean {
  if (ctx.role === "admin") return true;
  return event.createdByUserId === ctx.userId || event.assignedUserId === ctx.userId;
}

function assertRange(input: Pick<CalendarEventInput, "startsAt" | "endsAt">): void {
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new CalendarEventError("invalidRange");
  }
}

export async function createCalendarEvent(
  ctx: TenantContext,
  input: CalendarEventInput,
): Promise<CalendarEvent | null> {
  assertRange(input);
  const id = newId();

  await tenantDb(ctx)
    .insert(calendarEvents)
    .values({
      id,
      title: input.title,
      description: input.description ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay ?? false,
      location: input.location ?? null,
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      assignedUserId: input.assignedUserId ?? null,
      createdByUserId: ctx.userId,
    });

  return getCalendarEvent(ctx, id);
}

export async function getCalendarEvent(
  ctx: TenantContext,
  id: string,
): Promise<CalendarEvent | null> {
  const [row] = await tenantDb(ctx).select(calendarEvents, eq(calendarEvents.id, id)).limit(1);
  return row ?? null;
}

export type CalendarEventFilters = {
  assignedUserId?: string;
  contactId?: string;
};

/**
 * Everything overlapping `[from, to)` — not everything *starting* in it. A
 * visit that began yesterday and runs through today belongs on today's grid,
 * and a "starts within the window" query is exactly how it would go missing.
 */
export async function listCalendarEvents(
  ctx: TenantContext,
  from: Date,
  to: Date,
  filters: CalendarEventFilters = {},
): Promise<CalendarEvent[]> {
  const conditions: SQL[] = [lt(calendarEvents.startsAt, to), gt(calendarEvents.endsAt, from)];
  if (filters.assignedUserId) {
    conditions.push(eq(calendarEvents.assignedUserId, filters.assignedUserId));
  }
  if (filters.contactId) conditions.push(eq(calendarEvents.contactId, filters.contactId));

  const rows = await tenantDb(ctx).select(calendarEvents, and(...conditions) as SQL);
  return rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** The agenda tab on a contact record: what is booked with this person next. */
export async function listEventsForContact(
  ctx: TenantContext,
  contactId: string,
): Promise<CalendarEvent[]> {
  const rows = await tenantDb(ctx).select(
    calendarEvents,
    eq(calendarEvents.contactId, contactId),
  );
  return rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export async function updateCalendarEvent(
  ctx: TenantContext,
  id: string,
  input: Partial<CalendarEventInput>,
): Promise<CalendarEvent | null> {
  const existing = await getCalendarEvent(ctx, id);
  if (!existing) throw new CalendarEventError("notFound");
  if (!canModifyEvent(ctx, existing)) throw new CalendarEventError("forbidden");

  assertRange({
    startsAt: input.startsAt ?? existing.startsAt,
    endsAt: input.endsAt ?? existing.endsAt,
  });

  await tenantDb(ctx)
    .update(calendarEvents)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(calendarEvents.id, id));

  return getCalendarEvent(ctx, id);
}

/**
 * Deletes outright rather than cancelling: an event carries no history that
 * outlives it — no number a customer holds on paper, no thread — so the
 * reasoning that makes contact deletion narrow (modules/crm/deletion.ts)
 * doesn't apply here.
 */
export async function deleteCalendarEvent(ctx: TenantContext, id: string): Promise<void> {
  const existing = await getCalendarEvent(ctx, id);
  if (!existing) throw new CalendarEventError("notFound");
  if (!canModifyEvent(ctx, existing)) throw new CalendarEventError("forbidden");

  await tenantDb(ctx).delete(calendarEvents, eq(calendarEvents.id, id));
}
