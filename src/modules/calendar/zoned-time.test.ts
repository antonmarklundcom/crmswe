import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dayKeyOf,
  isDayKey,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toLocalFields,
  weekdayOf,
  zonedTimeToUtc,
} from "./zoned-time";

// Asunción is UTC-3 year-round; Stockholm moves twice a year. Both are
// tenant timezones this app actually ships to, and the second is what proves
// the offset is read at the answer rather than at the guess.
const ASU = "America/Asuncion";
const STO = "Europe/Stockholm";

describe("dayKeyOf", () => {
  it("keeps a late-evening appointment on the local day", () => {
    // 2026-08-25T01:00Z is still the 24th in Asunción.
    expect(dayKeyOf(new Date("2026-08-25T01:00:00Z"), ASU)).toBe("2026-08-24");
  });

  it("is the UTC day when the zone is UTC", () => {
    expect(dayKeyOf(new Date("2026-08-25T01:00:00Z"), "UTC")).toBe("2026-08-25");
  });
});

describe("zonedTimeToUtc", () => {
  it("converts a wall time in a fixed-offset zone", () => {
    expect(zonedTimeToUtc("2026-08-24", "09:00", ASU).toISOString()).toBe(
      "2026-08-24T12:00:00.000Z",
    );
  });

  it("uses the offset in force on the day, not today's", () => {
    // Stockholm is UTC+1 in January and UTC+2 in July.
    expect(zonedTimeToUtc("2026-01-15", "09:00", STO).toISOString()).toBe(
      "2026-01-15T08:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-07-15", "09:00", STO).toISOString()).toBe(
      "2026-07-15T07:00:00.000Z",
    );
  });

  it("round-trips through the form fields", () => {
    const instant = zonedTimeToUtc("2026-03-29", "14:30", STO);
    expect(toLocalFields(instant, STO)).toEqual({ date: "2026-03-29", time: "14:30" });
  });

  it("puts local midnight three hours later in UTC for Asunción", () => {
    expect(startOfDay("2026-08-24", ASU).toISOString()).toBe("2026-08-24T03:00:00.000Z");
  });
});

describe("calendar arithmetic", () => {
  it("crosses a month end", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("starts the week on Monday", () => {
    // 2026-08-24 is a Monday; the 23rd is the Sunday before it, and belongs
    // to the previous week rather than starting one.
    expect(startOfWeek("2026-08-24")).toBe("2026-08-24");
    expect(startOfWeek("2026-08-28")).toBe("2026-08-24");
    expect(startOfWeek("2026-08-23")).toBe("2026-08-17");
  });

  it("knows its weekdays", () => {
    expect(weekdayOf("2026-08-24")).toBe(1);
    expect(weekdayOf("2026-08-23")).toBe(0);
  });

  it("moves whole months without spilling into the next one", () => {
    expect(startOfMonth("2026-08-24")).toBe("2026-08-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("recognizes a day key", () => {
    expect(isDayKey("2026-08-24")).toBe(true);
    expect(isDayKey("2026-8-24")).toBe(false);
    expect(isDayKey("2026-13-40")).toBe(false);
    expect(isDayKey(undefined)).toBe(false);
  });
});
