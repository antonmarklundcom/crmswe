import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("passes through numbers that already carry a +", () => {
    expect(normalizePhone("+46701234567", "US")).toBe("+46701234567");
  });

  it("converts a 00 prefix to +", () => {
    expect(normalizePhone("0046701234567")).toBe("+46701234567");
  });

  it("defaults to Sweden when no country is given", () => {
    expect(normalizePhone("0701234567")).toBe("+46701234567");
    expect(normalizePhone("070-123 45 67")).toBe("+46701234567");
  });

  it("drops a leading trunk 0 using the given country's dial code", () => {
    expect(normalizePhone("070-123 45 67", "SE")).toBe("+46701234567");
    expect(normalizePhone("0401234567", "NO")).toBe("+47401234567");
  });

  it("adds the country's dial code to a bare local number with no leading 0", () => {
    // Denmark has no trunk prefix, so a local number is exactly this shape.
    expect(normalizePhone("20123456", "DK")).toBe("+4520123456");
  });

  it("does not double the dial code when it's already present without a +", () => {
    expect(normalizePhone("46701234567", "SE")).toBe("+46701234567");
  });
});
