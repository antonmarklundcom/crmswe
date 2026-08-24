import { describe, expect, it } from "vitest";
import { businessWindowFor, generateSlots, minutesOfDay, pickResource, type GenerateSlotsInput } from "./slots";

// The rules a public booking page lives or dies by, pinned with no database
// and no wall clock (docs/SPEC-BOOKING.md §4). Everything below is in
// America/Asuncion because that is the market and because it is the zone whose
// DST transition would silently move a nine-o'clock appointment.

const TZ = "America/Asuncion";

const baseType = {
  durationMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  slotIncrementMinutes: 30,
  minNoticeMinutes: 0,
  maxAdvanceDays: 365,
};

function input(overrides: Partial<GenerateSlotsInput> = {}): GenerateSlotsInput {
  return {
    timeZone: TZ,
    from: "2026-09-07", // a Monday
    to: "2026-09-07",
    type: baseType,
    rules: [{ resourceId: "r1", weekday: 1, start: "08:00", end: "10:00" }],
    businessHours: null,
    busy: [],
    blackouts: [],
    now: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

/** Local wall clock of a produced slot, which is what a visitor actually reads. */
function local(instant: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

describe("minutesOfDay / businessWindowFor", () => {
  it("parses wall clock", () => {
    expect(minutesOfDay("08:30")).toBe(510);
    expect(minutesOfDay("00:00")).toBe(0);
  });

  it("distinguishes 'no hours configured' from 'closed that day'", () => {
    // undefined = no ceiling at all; null = the tenant closed that day. The
    // two must never collapse: one means "the form was never filled in", the
    // other means "we do not open on Sundays".
    expect(businessWindowFor(null, 1)).toBeUndefined();
    const hours = {
      sun: null,
      mon: { start: "09:00", end: "17:00" },
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
    };
    expect(businessWindowFor(hours, 0)).toBeNull();
    expect(businessWindowFor(hours, 1)).toEqual({ start: 540, end: 1020 });
  });
});

describe("generateSlots", () => {
  it("steps the availability window by the increment", () => {
    const slots = generateSlots(input());
    expect(slots.map((slot) => local(slot.startsAt))).toEqual(["08:00", "08:30", "09:00", "09:30"]);
  });

  it("offers nothing for a resource with no rules at all", () => {
    // Deliberately the opposite of isWithinBusinessHours' "unconfigured means
    // always open": an unconfigured public page must never offer a stranger
    // three in the morning.
    expect(generateSlots(input({ rules: [] }))).toEqual([]);
  });

  it("expresses a siesta as two rules on one weekday", () => {
    const slots = generateSlots(
      input({
        rules: [
          { resourceId: "r1", weekday: 1, start: "08:00", end: "09:00" },
          { resourceId: "r1", weekday: 1, start: "14:30", end: "15:30" },
        ],
      }),
    );
    expect(slots.map((slot) => local(slot.startsAt))).toEqual(["08:00", "08:30", "14:30", "15:00"]);
  });

  it("intersects the rule with the tenant's business hours", () => {
    const slots = generateSlots(
      input({
        rules: [{ resourceId: "r1", weekday: 1, start: "07:00", end: "20:00" }],
        businessHours: {
          sun: null,
          mon: { start: "09:00", end: "10:00" },
          tue: null,
          wed: null,
          thu: null,
          fri: null,
          sat: null,
        },
      }),
    );
    expect(slots.map((slot) => local(slot.startsAt))).toEqual(["09:00", "09:30"]);
  });

  it("closes a day the tenant marked closed, whatever the rules say", () => {
    const slots = generateSlots(
      input({
        businessHours: {
          sun: null,
          mon: null,
          tue: null,
          wed: null,
          thu: null,
          fri: null,
          sat: null,
        },
      }),
    );
    expect(slots).toEqual([]);
  });

  it("keeps buffers inside the window rather than charging them to the visitor", () => {
    const slots = generateSlots(
      input({
        type: { ...baseType, bufferBeforeMinutes: 15, bufferAfterMinutes: 15 },
      }),
    );
    // 08:00 can't run (no room for the 15 before it) and 09:30 can't either
    // (no room for the 15 after); the visitor still sees a 30-minute booking.
    expect(slots.map((slot) => local(slot.startsAt))).toEqual(["08:30", "09:00"]);
    expect(slots[0].endsAt.getTime() - slots[0].startsAt.getTime()).toBe(30 * 60_000);
  });

  it("blocks a slot against a calendar event the booking system never created", () => {
    // The whole reason bookings write calendar_events: a rep's own 08:30 site
    // visit has to make 08:30 unbookable, with no sync job in either
    // direction.
    const slots = generateSlots(
      input({
        busy: [
          {
            resourceId: "r1",
            startsAt: new Date("2026-09-07T11:30:00Z"), // 08:30 local
            endsAt: new Date("2026-09-07T12:00:00Z"),
          },
        ],
      }),
    );
    expect(slots.map((slot) => local(slot.startsAt))).toEqual(["08:00", "09:00", "09:30"]);
  });

  it("counts a buffer as busy time, not just the appointment", () => {
    const slots = generateSlots(
      input({
        type: { ...baseType, bufferBeforeMinutes: 0, bufferAfterMinutes: 30 },
        rules: [{ resourceId: "r1", weekday: 1, start: "08:00", end: "11:00" }],
        busy: [
          {
            resourceId: "r1",
            startsAt: new Date("2026-09-07T12:30:00Z"), // 09:30 local
            endsAt: new Date("2026-09-07T13:00:00Z"),
          },
        ],
      }),
    );
    // 09:00 is free itself but its trailing buffer runs into the 09:30 event,
    // so it is not offered; 10:00 is, because by then the event is over and
    // its own buffer still fits inside the window.
    expect(slots.map((slot) => local(slot.startsAt))).toEqual(["08:00", "08:30", "10:00"]);
  });

  it("does not let one resource's busy time block another's slot", () => {
    const slots = generateSlots(
      input({
        rules: [
          { resourceId: "r1", weekday: 1, start: "08:00", end: "09:00" },
          { resourceId: "r2", weekday: 1, start: "08:00", end: "09:00" },
        ],
        busy: [
          {
            resourceId: "r1",
            startsAt: new Date("2026-09-07T11:00:00Z"), // 08:00 local
            endsAt: new Date("2026-09-07T11:30:00Z"),
          },
        ],
      }),
    );
    expect(slots.map((slot) => [local(slot.startsAt), slot.resourceIds])).toEqual([
      ["08:00", ["r2"]],
      ["08:30", ["r1", "r2"]],
    ]);
  });

  it("honours a tenant-wide blackout and a per-resource one", () => {
    const day = { startsAt: new Date("2026-09-07T11:00:00Z"), endsAt: new Date("2026-09-08T11:00:00Z") };
    expect(generateSlots(input({ blackouts: [{ resourceId: null, ...day }] }))).toEqual([]);
    expect(generateSlots(input({ blackouts: [{ resourceId: "r1", ...day }] }))).toEqual([]);
    expect(
      generateSlots(input({ blackouts: [{ resourceId: "r-other", ...day }] })),
    ).toHaveLength(4);
  });

  it("refuses anything inside the minimum notice", () => {
    const slots = generateSlots(
      input({
        type: { ...baseType, minNoticeMinutes: 120 },
        now: new Date("2026-09-07T10:00:00Z"), // 07:00 local, same morning
      }),
    );
    expect(slots.map((slot) => local(slot.startsAt))).toEqual(["09:00", "09:30"]);
  });

  it("refuses anything past the advance horizon, counted from today not from the window", () => {
    // A visitor paging to next month must not push the horizon along with them.
    const slots = generateSlots(
      input({
        from: "2026-09-07",
        to: "2026-09-14",
        type: { ...baseType, maxAdvanceDays: 3 },
        rules: [
          { resourceId: "r1", weekday: 1, start: "08:00", end: "08:30" },
        ],
        now: new Date("2026-09-05T12:00:00Z"),
      }),
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].startsAt.toISOString()).toBe("2026-09-07T11:00:00.000Z");
  });

  it("caps a day by local day, not UTC day", () => {
    // A 22:00 slot in Asunción is already the next day in UTC; counting it
    // against Tuesday's cap would be wrong in exactly the way the whole
    // zoned-time module exists to prevent.
    const slots = generateSlots(
      input({
        rules: [{ resourceId: "r1", weekday: 1, start: "21:00", end: "23:00" }],
        type: { ...baseType, maxPerDay: 3 },
      }),
    );
    expect(slots).toHaveLength(3);
    expect(slots.every((slot) => slot.startsAt.toISOString().startsWith("2026-09-08"))).toBe(true);
    expect(slots.map((slot) => local(slot.startsAt))).toEqual(["21:00", "21:30", "22:00"]);
  });

  it("keeps 09:00 at 09:00 across Paraguay's DST change", () => {
    // Paraguay moved to permanent -03:00 in 2024, so the modern answer is a
    // stable offset — this asserts the conversion goes through the zone
    // rather than through the server's clock either way.
    const slots = generateSlots(
      input({
        from: "2026-10-04",
        to: "2026-10-05",
        rules: [
          { resourceId: "r1", weekday: 0, start: "09:00", end: "09:30" },
          { resourceId: "r1", weekday: 1, start: "09:00", end: "09:30" },
        ],
      }),
    );
    expect(slots.map((slot) => local(slot.startsAt))).toEqual(["09:00", "09:00"]);
  });

  it("returns starts in order with sorted resources, so the answer is stable", () => {
    const slots = generateSlots(
      input({
        rules: [
          { resourceId: "z", weekday: 1, start: "08:00", end: "08:30" },
          { resourceId: "a", weekday: 1, start: "08:00", end: "08:30" },
        ],
      }),
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].resourceIds).toEqual(["a", "z"]);
  });
});

describe("pickResource", () => {
  it("is deterministic for fixed and any", () => {
    expect(pickResource("any", ["z", "a"], new Map())).toBe("a");
    expect(pickResource("fixed", ["z", "a"], new Map())).toBe("a");
  });

  it("gives round robin to the least loaded, breaking ties on id", () => {
    const load = new Map([
      ["a", 3],
      ["b", 1],
      ["c", 1],
    ]);
    expect(pickResource("round_robin", ["a", "b", "c"], load)).toBe("b");
  });

  it("treats an unseen resource as unloaded", () => {
    expect(pickResource("round_robin", ["a", "b"], new Map([["a", 2]]))).toBe("b");
  });

  it("returns null when nothing is free", () => {
    expect(pickResource("any", [], new Map())).toBeNull();
  });
});
