import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./index";

describe("checkRateLimit", () => {
  it("allows requests up to the limit, then blocks", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).limited).toBe(false);
    }
    expect(checkRateLimit(key, 3, 60_000).limited).toBe(true);
  });

  it("keeps separate buckets per key", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 2; i++) checkRateLimit(a, 2, 60_000);
    expect(checkRateLimit(a, 2, 60_000).limited).toBe(true);
    expect(checkRateLimit(b, 2, 60_000).limited).toBe(false);
  });

  it("resets after the window elapses", async () => {
    const key = `window-${Math.random()}`;
    expect(checkRateLimit(key, 1, 10).limited).toBe(false);
    expect(checkRateLimit(key, 1, 10).limited).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(checkRateLimit(key, 1, 10).limited).toBe(false);
  });
});
