import { listTasksDueBetween } from "@/modules/crm/tasks";
import type { TenantContext } from "@/modules/tenancy/context";
import type { CalendarEntry } from "./grid";
import { listCalendarEvents, type CalendarEventFilters } from "./events";

// One list for the grid to draw. The agenda is not only its own events: a
// follow-up task due on Thursday is a thing on Thursday, and a rep who has to
// check two screens to answer "what does Thursday look like" checks one.
// Tasks stay read-only here — they are created and closed on the contact
// record that owns them, and duplicating that here would be two ways to do
// one thing.

export async function listCalendarEntries(
  ctx: TenantContext,
  from: Date,
  to: Date,
  filters: CalendarEventFilters = {},
): Promise<CalendarEntry[]> {
  const [events, tasks] = await Promise.all([
    listCalendarEvents(ctx, from, to, filters),
    listTasksDueBetween(ctx, from, to),
  ]);

  const eventEntries: CalendarEntry[] = events.map((event) => ({
    id: event.id,
    kind: "event",
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    assignedUserId: event.assignedUserId,
    contactId: event.contactId,
    href: `/calendar/${event.id}`,
  }));

  // The per-rep filter has to mean the same thing on both layers, or
  // "mi agenda" would hide someone's events while leaving their tasks.
  const taskEntries: CalendarEntry[] = tasks
    .filter((task) => !filters.assignedUserId || task.assignedUserId === filters.assignedUserId)
    .filter((task) => !filters.contactId || task.contactId === filters.contactId)
    .map((task) => ({
      id: task.id,
      kind: "task",
      title: task.title,
      startsAt: task.dueAt,
      endsAt: null,
      allDay: false,
      assignedUserId: task.assignedUserId,
      contactId: task.contactId,
      href: `/contacts/${task.contactId}?tab=tareas`,
      done: task.completedAt !== null,
    }));

  return [...eventEntries, ...taskEntries];
}
