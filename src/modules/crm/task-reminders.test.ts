import { describe, expect, it } from "vitest";
import { appointmentsForUser } from "./task-reminders";

// Which appointments belong in one person's daily mail. Pure, so the rule can
// be checked without a mailbox or a database.

type Row = {
  id: string;
  assignedUserId: string | null;
  createdByUserId: string;
  startsAt: Date;
  endsAt: Date;
};

const NOW = new Date("2026-08-24T12:00:00Z");
const HORIZON = new Date("2026-08-25T12:00:00Z");

function event(partial: Partial<Row> & { id: string }): Row {
  return {
    assignedUserId: null,
    createdByUserId: "someone",
    startsAt: new Date("2026-08-24T15:00:00Z"),
    endsAt: new Date("2026-08-24T16:00:00Z"),
    ...partial,
  };
}

describe("appointmentsForUser", () => {
  it("includes what is assigned to them", () => {
    const rows = [event({ id: "mine", assignedUserId: "u1" }), event({ id: "theirs", assignedUserId: "u2" })];
    expect(appointmentsForUser(rows, "u1", NOW, HORIZON).map((e) => e.id)).toEqual(["mine"]);
  });

  it("includes an unassigned one they booked themselves", () => {
    // Booking a visit without naming an owner means yourself.
    const rows = [event({ id: "unassigned", createdByUserId: "u1" })];
    expect(appointmentsForUser(rows, "u1", NOW, HORIZON).map((e) => e.id)).toEqual(["unassigned"]);
  });

  it("does not mail somebody else's unassigned booking to the whole business", () => {
    const rows = [event({ id: "not-mine", createdByUserId: "u2" })];
    expect(appointmentsForUser(rows, "u1", NOW, HORIZON)).toEqual([]);
  });

  it("prefers the assignee over the creator", () => {
    // Created by u1, handed to u2: it is u2's day now, not u1's.
    const rows = [event({ id: "handed-over", createdByUserId: "u1", assignedUserId: "u2" })];
    expect(appointmentsForUser(rows, "u1", NOW, HORIZON)).toEqual([]);
    expect(appointmentsForUser(rows, "u2", NOW, HORIZON).map((e) => e.id)).toEqual(["handed-over"]);
  });

  it("keeps one already under way at send time", () => {
    const rows = [
      event({
        id: "in-progress",
        assignedUserId: "u1",
        startsAt: new Date("2026-08-24T11:00:00Z"),
        endsAt: new Date("2026-08-24T13:00:00Z"),
      }),
    ];
    expect(appointmentsForUser(rows, "u1", NOW, HORIZON).map((e) => e.id)).toEqual(["in-progress"]);
  });

  it("drops what is over, and what is beyond the horizon", () => {
    const rows = [
      event({
        id: "yesterday",
        assignedUserId: "u1",
        startsAt: new Date("2026-08-23T15:00:00Z"),
        endsAt: new Date("2026-08-23T16:00:00Z"),
      }),
      event({
        id: "next-week",
        assignedUserId: "u1",
        startsAt: new Date("2026-08-31T15:00:00Z"),
        endsAt: new Date("2026-08-31T16:00:00Z"),
      }),
    ];
    expect(appointmentsForUser(rows, "u1", NOW, HORIZON)).toEqual([]);
  });

  it("returns them in the order the day runs", () => {
    const rows = [
      event({ id: "later", assignedUserId: "u1", startsAt: new Date("2026-08-24T18:00:00Z"), endsAt: new Date("2026-08-24T19:00:00Z") }),
      event({ id: "sooner", assignedUserId: "u1", startsAt: new Date("2026-08-24T14:00:00Z"), endsAt: new Date("2026-08-24T15:00:00Z") }),
    ];
    expect(appointmentsForUser(rows, "u1", NOW, HORIZON).map((e) => e.id)).toEqual([
      "sooner",
      "later",
    ]);
  });
});
