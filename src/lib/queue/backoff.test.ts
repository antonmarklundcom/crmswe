import { describe, expect, it } from "vitest";
import { backoffDelayMs, nextRunAt } from "./backoff";

describe("backoffDelayMs", () => {
  it("doubles per attempt starting at 1s", () => {
    expect(backoffDelayMs(1)).toBe(1000);
    expect(backoffDelayMs(2)).toBe(2000);
    expect(backoffDelayMs(3)).toBe(4000);
    expect(backoffDelayMs(4)).toBe(8000);
  });

  it("caps at 5 minutes", () => {
    expect(backoffDelayMs(20)).toBe(5 * 60 * 1000);
  });

  it("treats non-positive attempts as attempt 1", () => {
    expect(backoffDelayMs(0)).toBe(1000);
  });
});

describe("nextRunAt", () => {
  it("offsets from the given base time by the backoff delay", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(nextRunAt(2, from).toISOString()).toBe(
      "2026-01-01T00:00:02.000Z",
    );
  });
});
