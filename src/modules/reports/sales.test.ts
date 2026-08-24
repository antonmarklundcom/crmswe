import { describe, expect, it } from "vitest";
import { computeResponseTimes, reportWindow } from "./sales";

// First-response time is the one number here that is a judgement rather than
// a count, so its rules are pinned down: which message starts the clock,
// which stops it, and what happens to a conversation nobody answered.

const at = (iso: string) => new Date(iso);

function message(conversationId: string, direction: "in" | "out", iso: string) {
  return { conversationId, direction, createdAt: at(iso) };
}

describe("computeResponseTimes", () => {
  it("measures from the first inbound to the first reply after it", () => {
    const result = computeResponseTimes([
      message("c1", "in", "2026-08-24T12:00:00Z"),
      message("c1", "out", "2026-08-24T12:30:00Z"),
    ]);

    expect(result.answered).toBe(1);
    expect(result.medianMinutes).toBe(30);
    expect(result.unanswered).toBe(0);
  });

  it("ignores an outbound that came before the customer wrote", () => {
    // A template sent yesterday is not a reply to today's message.
    const result = computeResponseTimes([
      message("c1", "out", "2026-08-24T09:00:00Z"),
      message("c1", "in", "2026-08-24T12:00:00Z"),
      message("c1", "out", "2026-08-24T12:15:00Z"),
    ]);

    expect(result.medianMinutes).toBe(15);
  });

  it("counts an unanswered conversation separately instead of as a huge number", () => {
    // Folding it into the average is how one ignored customer hides behind a
    // decent-looking mean.
    const result = computeResponseTimes([
      message("c1", "in", "2026-08-24T12:00:00Z"),
      message("c2", "in", "2026-08-24T12:00:00Z"),
      message("c2", "out", "2026-08-24T12:10:00Z"),
    ]);

    expect(result.answered).toBe(1);
    expect(result.unanswered).toBe(1);
    expect(result.medianMinutes).toBe(10);
  });

  it("skips a conversation the business started and the customer never answered", () => {
    const result = computeResponseTimes([message("c1", "out", "2026-08-24T12:00:00Z")]);

    expect(result).toEqual({
      answered: 0,
      unanswered: 0,
      medianMinutes: null,
      slowestMinutes: null,
    });
  });

  it("takes the median, not the mean — one bad weekend must not set the number", () => {
    const result = computeResponseTimes([
      message("c1", "in", "2026-08-24T12:00:00Z"),
      message("c1", "out", "2026-08-24T12:05:00Z"),
      message("c2", "in", "2026-08-24T12:00:00Z"),
      message("c2", "out", "2026-08-24T12:10:00Z"),
      message("c3", "in", "2026-08-22T12:00:00Z"),
      message("c3", "out", "2026-08-24T12:00:00Z"),
    ]);

    expect(result.medianMinutes).toBe(10);
    expect(result.slowestMinutes).toBe(2880);
  });

  it("is unordered-input safe", () => {
    const result = computeResponseTimes([
      message("c1", "out", "2026-08-24T12:20:00Z"),
      message("c1", "in", "2026-08-24T12:00:00Z"),
    ]);

    expect(result.medianMinutes).toBe(20);
  });
});

describe("reportWindow", () => {
  it("ends now and starts N days back", () => {
    const now = at("2026-08-24T12:00:00Z");
    const window = reportWindow(30, now);

    expect(window.to).toEqual(now);
    expect(window.from.toISOString()).toBe("2026-07-25T12:00:00.000Z");
    expect(window.days).toBe(30);
  });
});
