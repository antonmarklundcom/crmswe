import { describe, expect, it } from "vitest";
import { bucketByDay, buildRange, isCalendarView, type CalendarEntry } from "./grid";

const ASU = "America/Asuncion";
const NOW = new Date("2026-08-24T15:00:00Z");

describe("buildRange", () => {
  it("gives a week of seven days, Monday first", () => {
    const range = buildRange("week", "2026-08-27", ASU, NOW);
    expect(range.days).toHaveLength(7);
    expect(range.days[0]).toBe("2026-08-24");
    expect(range.days[6]).toBe("2026-08-30");
  });

  it("queries the window in the tenant's zone, end exclusive", () => {
    const range = buildRange("week", "2026-08-24", ASU, NOW);
    expect(range.from.toISOString()).toBe("2026-08-24T03:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-08-31T03:00:00.000Z");
  });

  it("covers a month in whole weeks, spilling either side", () => {
    // August 2026 starts on a Saturday, so the grid opens on July 27.
    const range = buildRange("month", "2026-08-15", ASU, NOW);
    expect(range.days[0]).toBe("2026-07-27");
    expect(range.days.length % 7).toBe(0);
    expect(range.days).toContain("2026-08-01");
    expect(range.days).toContain("2026-08-31");
    // …and stops as soon as the month is covered rather than always drawing
    // six rows of mostly-empty cells.
    expect(range.days[range.days.length - 1]).toBe("2026-09-06");
  });

  it("steps a week at a time in week view and a month at a time in month view", () => {
    expect(buildRange("week", "2026-08-24", ASU, NOW).next).toBe("2026-08-31");
    expect(buildRange("month", "2026-08-24", ASU, NOW).next).toBe("2026-09-01");
    expect(buildRange("month", "2026-08-24", ASU, NOW).previous).toBe("2026-07-01");
  });

  it("knows today in the tenant's zone", () => {
    // 03:00Z on the 25th is still the 24th in Asunción.
    expect(buildRange("week", "2026-08-24", ASU, new Date("2026-08-25T02:00:00Z")).today).toBe(
      "2026-08-24",
    );
  });

  it("only accepts the two views it draws", () => {
    expect(isCalendarView("week")).toBe(true);
    expect(isCalendarView("month")).toBe(true);
    expect(isCalendarView("day")).toBe(false);
  });
});

function entry(partial: Partial<CalendarEntry> & { id: string; startsAt: Date }): CalendarEntry {
  return {
    kind: "event",
    title: partial.id,
    endsAt: null,
    allDay: false,
    assignedUserId: null,
    contactId: null,
    href: `/calendar/${partial.id}`,
    ...partial,
  };
}

describe("bucketByDay", () => {
  const days = buildRange("week", "2026-08-24", ASU, NOW).days;

  it("puts a timed event on its local day", () => {
    // 01:00Z Tuesday is 22:00 Monday in Asunción.
    const buckets = bucketByDay(
      [entry({ id: "tarde", startsAt: new Date("2026-08-25T01:00:00Z") })],
      days,
      ASU,
    );
    expect(buckets.get("2026-08-24")!.map((e) => e.id)).toEqual(["tarde"]);
    expect(buckets.get("2026-08-25")).toEqual([]);
  });

  it("shows a multi-day event on every day it touches", () => {
    const buckets = bucketByDay(
      [
        entry({
          id: "obra",
          startsAt: new Date("2026-08-25T13:00:00Z"),
          endsAt: new Date("2026-08-27T18:00:00Z"),
        }),
      ],
      days,
      ASU,
    );
    expect(buckets.get("2026-08-25")).toHaveLength(1);
    expect(buckets.get("2026-08-26")).toHaveLength(1);
    expect(buckets.get("2026-08-27")).toHaveLength(1);
    expect(buckets.get("2026-08-28")).toHaveLength(0);
  });

  it("treats the end as exclusive, so an all-day event covers one day", () => {
    const buckets = bucketByDay(
      [
        entry({
          id: "feriado",
          allDay: true,
          startsAt: new Date("2026-08-26T03:00:00Z"),
          endsAt: new Date("2026-08-27T03:00:00Z"),
        }),
      ],
      days,
      ASU,
    );
    expect(buckets.get("2026-08-26")).toHaveLength(1);
    expect(buckets.get("2026-08-27")).toHaveLength(0);
  });

  it("reads a day all-day first, then by start time", () => {
    const buckets = bucketByDay(
      [
        entry({ id: "tarde", startsAt: new Date("2026-08-26T20:00:00Z") }),
        entry({ id: "manana", startsAt: new Date("2026-08-26T12:00:00Z") }),
        entry({
          id: "todo-el-dia",
          allDay: true,
          startsAt: new Date("2026-08-26T03:00:00Z"),
          endsAt: new Date("2026-08-27T03:00:00Z"),
        }),
      ],
      days,
      ASU,
    );
    expect(buckets.get("2026-08-26")!.map((e) => e.id)).toEqual([
      "todo-el-dia",
      "manana",
      "tarde",
    ]);
  });

  it("ignores what falls outside the drawn days", () => {
    const buckets = bucketByDay(
      [entry({ id: "lejos", startsAt: new Date("2026-09-20T13:00:00Z") })],
      days,
      ASU,
    );
    expect([...buckets.values()].flat()).toEqual([]);
  });
});
