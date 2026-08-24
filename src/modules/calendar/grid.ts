import {
  addDays,
  addMonths,
  dayKeyOf,
  startOfDay,
  startOfMonth,
  startOfWeek,
  todayIn,
  type DayKey,
} from "./zoned-time";

// Turning "week of the 24th" into the days a grid draws and the window the
// database is asked for. Pure — it takes a timezone and a reference instant
// rather than reading the clock — so the week boundaries are testable without
// pretending to be in Asunción.

export const CALENDAR_VIEWS = ["week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export function isCalendarView(value: string | undefined): value is CalendarView {
  return CALENDAR_VIEWS.includes(value as CalendarView);
}

export type CalendarRange = {
  view: CalendarView;
  /** The day the view is anchored on — what the URL carries. */
  anchor: DayKey;
  /** Every cell the grid draws, in order. A month view is whole weeks, so it
   * spills into the neighbouring months rather than starting mid-row. */
  days: DayKey[];
  /** The window to query: `[from, to)`, both real instants. */
  from: Date;
  to: Date;
  /** Anchors for the previous/next buttons. */
  previous: DayKey;
  next: DayKey;
  today: DayKey;
};

export function buildRange(
  view: CalendarView,
  anchor: DayKey,
  timeZone: string,
  now: Date = new Date(),
): CalendarRange {
  const first = view === "week" ? startOfWeek(anchor) : startOfWeek(startOfMonth(anchor));

  let length: number;
  if (view === "week") {
    length = 7;
  } else {
    // Whole weeks until the month is covered — 28 through 42 days depending
    // on where the first lands, which is why this counts rather than assuming
    // six rows.
    const nextMonth = addMonths(startOfMonth(anchor), 1);
    length = 7;
    while (addDays(first, length) < nextMonth) length += 7;
  }

  const days = Array.from({ length }, (_, index) => addDays(first, index));

  return {
    view,
    anchor,
    days,
    from: startOfDay(days[0], timeZone),
    to: startOfDay(addDays(days[days.length - 1], 1), timeZone),
    previous: view === "week" ? addDays(anchor, -7) : addMonths(startOfMonth(anchor), -1),
    next: view === "week" ? addDays(anchor, 7) : addMonths(startOfMonth(anchor), 1),
    today: todayIn(timeZone, now),
  };
}

// --- Week view hour rail --------------------------------------------------
//
// The week grid draws a Google-Calendar-style left rail of hour labels with
// timed entries positioned against it, so which day a column is stays
// legible at a glance instead of resting on a small weekday abbreviation
// alone. Month view stays the cell-list it already was — a month is read as
// "which days had something", not "when in the day", so an hourly axis
// would only add noise there.

/** The window the week grid's hour rail covers — wide enough for a normal
 * business day without making every row so short a short visit disappears. */
export const WEEK_GRID_START_HOUR = 7;
export const WEEK_GRID_END_HOUR = 21;

/** One label per hour the rail draws, e.g. [7, 8, …, 20]. */
export function weekGridHours(): number[] {
  return Array.from(
    { length: WEEK_GRID_END_HOUR - WEEK_GRID_START_HOUR },
    (_, index) => WEEK_GRID_START_HOUR + index,
  );
}

function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

/** A block short enough to become a sliver (a point-in-time task, a
 * five-minute call) still has to stay readable and clickable. */
const MIN_ENTRY_HEIGHT_PERCENT = 4;

/**
 * Where a timed entry sits within one day's column of the week grid, as
 * percentages of the WEEK_GRID_START_HOUR–WEEK_GRID_END_HOUR window — for
 * absolutely positioning it with `style={{ top, height }}`.
 *
 * An entry that starts before, or a task with no end that would fall after,
 * the shown window is clamped to the window's edge rather than hidden — the
 * same "still appears, just pinned" choice bucketByDay already makes for a
 * multi-day event on a day it only partly touches. A task (endsAt: null) is
 * drawn as a short block from its due time, long enough to read and click.
 */
export function weekGridPosition(
  entry: Pick<CalendarEntry, "startsAt" | "endsAt">,
  day: DayKey,
  timeZone: string,
): { topPercent: number; heightPercent: number } {
  const dayStart = startOfDay(day, timeZone).getTime();
  const dayEnd = startOfDay(addDays(day, 1), timeZone).getTime();
  const windowStart = dayStart + WEEK_GRID_START_HOUR * 60 * 60 * 1000;
  const windowEnd = dayStart + WEEK_GRID_END_HOUR * 60 * 60 * 1000;
  const windowMs = windowEnd - windowStart;

  const rawEnd =
    entry.endsAt && entry.endsAt.getTime() > entry.startsAt.getTime()
      ? entry.endsAt.getTime()
      : entry.startsAt.getTime() + 30 * 60 * 1000;

  const clampedStart = Math.min(Math.max(entry.startsAt.getTime(), dayStart), dayEnd);
  const clampedEnd = Math.min(Math.max(rawEnd, dayStart), dayEnd);

  const topPercent = clampPercent(((clampedStart - windowStart) / windowMs) * 100);
  const bottomPercent = clampPercent(((clampedEnd - windowStart) / windowMs) * 100);

  return {
    topPercent,
    heightPercent: Math.max(bottomPercent - topPercent, MIN_ENTRY_HEIGHT_PERCENT),
  };
}

/** What a grid cell shows: an agenda event, or a task falling due. */
export type CalendarEntry = {
  id: string;
  kind: "event" | "task";
  title: string;
  startsAt: Date;
  /** Null for a task — a due date is a moment, not a span. */
  endsAt: Date | null;
  allDay: boolean;
  assignedUserId: string | null;
  contactId: string | null;
  /** Where clicking it goes. */
  href: string;
  /** Tasks already marked done still show, struck through. */
  done?: boolean;
};

/**
 * Buckets entries into the days they touch, in the tenant's timezone.
 *
 * A two-day visit appears in both cells rather than only the first: the grid
 * is what a rep reads to answer "am I free on Thursday", and an event that
 * silently occupies Thursday without showing there is the one failure that
 * makes a calendar useless. The end is treated as exclusive — an all-day
 * event stored as local-midnight-to-local-midnight covers one day, not two.
 */
export function bucketByDay(
  entries: CalendarEntry[],
  days: DayKey[],
  timeZone: string,
): Map<DayKey, CalendarEntry[]> {
  const buckets = new Map<DayKey, CalendarEntry[]>(days.map((day) => [day, []]));

  for (const entry of entries) {
    const firstDay = dayKeyOf(entry.startsAt, timeZone);
    const lastDay =
      entry.endsAt && entry.endsAt.getTime() > entry.startsAt.getTime()
        ? dayKeyOf(new Date(entry.endsAt.getTime() - 1), timeZone)
        : firstDay;

    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      buckets.get(day)?.push(entry);
    }
  }

  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => {
      // All-day first, then by start: that is the order the day reads in.
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startsAt.getTime() - b.startsAt.getTime();
    });
  }

  return buckets;
}
