import { describe, expect, it } from "vitest";
import { inboundMessageTime, latest } from "./inbound-time";

// The 24h free-form window (PLAN.md §6.4) is only correct if it starts at
// the customer's send time. These pin the two rules the ingest path relies
// on; the module is deliberately free of env/db imports so this needs no
// configured environment.

describe("inboundMessageTime", () => {
  const receivedAt = new Date("2026-08-21T12:00:00.000Z");

  it("uses Meta's timestamp, not the moment the webhook was processed", () => {
    // Six hours of queue backlog: the window must already be six hours old.
    const sent = new Date("2026-08-21T06:00:00.000Z");
    const raw = String(Math.floor(sent.getTime() / 1000));

    expect(inboundMessageTime(raw, receivedAt)).toEqual(sent);
  });

  it("falls back to the receipt time when the timestamp is missing or junk", () => {
    for (const raw of ["", "not-a-number", "0", "-100", "NaN"]) {
      expect(inboundMessageTime(raw, receivedAt)).toEqual(receivedAt);
    }
  });

  it("never accepts a future timestamp, which would hold the window open past 24h", () => {
    const future = String(Math.floor(receivedAt.getTime() / 1000) + 3600);
    expect(inboundMessageTime(future, receivedAt)).toEqual(receivedAt);
  });
});

describe("latest", () => {
  const older = new Date("2026-08-20T10:00:00.000Z");
  const newer = new Date("2026-08-21T10:00:00.000Z");

  it("takes the candidate when there is nothing stored yet", () => {
    expect(latest(null, newer)).toEqual(newer);
  });

  it("moves forward", () => {
    expect(latest(older, newer)).toEqual(newer);
  });

  it("never moves backwards on a redelivered older message", () => {
    expect(latest(newer, older)).toEqual(newer);
  });
});
