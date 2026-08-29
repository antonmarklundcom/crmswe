// Wall-clock arithmetic in the tenant's timezone (§2.3: store UTC, render in
// `tenants.timezone`). The calendar is the one surface where "which day is
// this" is a business answer rather than a formatting detail: a visit at
// 22:00 in Asunción belongs to that Tuesday even though the stored instant is
// already Wednesday in UTC, and a server in another zone must not move it.
//
// No date library: Intl already knows every zone's offset, including the
// historical ones, and everything below is derived from it.

/** A local calendar day, `YYYY-MM-DD` — the key every grid is built from. */
export type DayKey = string;

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = partsCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    partsCache.set(timeZone, cached);
  }
  return cached;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** The wall clock a given instant shows in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)!.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    // Intl renders midnight as hour 24 in some environments under hour12:
    // false; normalizing keeps the arithmetic below honest.
    hour: value("hour") % 24,
    minute: value("minute"),
    second: value("second"),
  };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** Which local day an instant falls on, in `timeZone`. */
export function dayKeyOf(instant: Date, timeZone: string): DayKey {
  const { year, month, day } = zonedParts(instant, timeZone);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/**
 * The instant at which a local wall time occurs.
 *
 * Reading the offset off a first guess and correcting once is the standard
 * construction, and the second read is what makes it right across a DST
 * boundary — the offset that applies is the one *at the answer*, not the one
 * at the guess. Paraguay has no DST any more, but the tenant timezone is a
 * free-text setting and this must not quietly break for one that does.
 */
export function zonedTimeToUtc(
  day: DayKey,
  time: string,
  timeZone: string,
): Date {
  const [hour = "00", minute = "00"] = time.split(":");
  const naive = Date.parse(`${day}T${pad(Number(hour))}:${pad(Number(minute))}:00Z`);
  if (Number.isNaN(naive)) throw new Error(`Invalid local time: ${day} ${time}`);

  let instant = naive;
  for (let pass = 0; pass < 2; pass += 1) {
    const shown = zonedParts(new Date(instant), timeZone);
    const shownAsUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    const offset = shownAsUtc - instant;
    const corrected = naive - offset;
    if (corrected === instant) break;
    instant = corrected;
  }

  return new Date(instant);
}

/** Local midnight starting `day`, as an instant. */
export function startOfDay(day: DayKey, timeZone: string): Date {
  return zonedTimeToUtc(day, "00:00", timeZone);
}

/** Calendar-day arithmetic on the key itself — no timezone involved, because
 * "the day after 2026-03-01" is the same answer everywhere. */
export function addDays(day: DayKey, count: number): DayKey {
  const shifted = new Date(`${day}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + count);
  return shifted.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for the local day the key names. */
export function weekdayOf(day: DayKey): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Monday-first, the week Sweden — and every locale this ships in — reads. */
export function startOfWeek(day: DayKey): DayKey {
  const weekday = weekdayOf(day);
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

/**
 * ISO-8601 week number (plan.md §5.3.4; sweden-business-apps §7).
 *
 * Swedish planning runs on week numbers for real — "vecka 35" is how a
 * booking is agreed on the phone — so a calendar here that does not show
 * them is missing something a Swedish user expects to read, not a nicety.
 *
 * ISO, not "count the weeks since January 1st": week 1 is the week holding
 * the first Thursday, so the first days of a year routinely belong to week
 * 52 or 53 of the year before, and the last days to week 1 of the next. That
 * is the definition Sweden uses, and off-by-one at New Year is precisely the
 * bug that makes a week number untrustworthy.
 *
 * Computed on the day key itself, in UTC, with no timezone involved — which
 * week a calendar day falls in is the same answer everywhere, exactly like
 * `addDays` above.
 */
export function isoWeekOf(day: DayKey): number {
  const date = new Date(`${day}T00:00:00Z`);
  // Monday = 0 … Sunday = 6, so stepping to Thursday is the same arithmetic
  // whatever day we start on.
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday + 3);

  // The Thursday of week 1 — found from January 4th, which ISO guarantees is
  // always in week 1, by the same step.
  const jan4 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const jan4Weekday = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - jan4Weekday + 3);

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  return 1 + Math.round((date.getTime() - jan4.getTime()) / WEEK_MS);
}

export function startOfMonth(day: DayKey): DayKey {
  return `${day.slice(0, 7)}-01`;
}

export function addMonths(day: DayKey, count: number): DayKey {
  const [year, month] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + count, 1));
  return shifted.toISOString().slice(0, 10);
}

/** Today, where the tenant is. */
export function todayIn(timeZone: string, now: Date = new Date()): DayKey {
  return dayKeyOf(now, timeZone);
}

/** The date and time boxes of an edit form, filled from a stored instant. */
export function toLocalFields(instant: Date, timeZone: string): { date: DayKey; time: string } {
  const { year, month, day, hour, minute } = zonedParts(instant, timeZone);
  return {
    date: `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
  };
}

export function isDayKey(value: string | undefined): value is DayKey {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
