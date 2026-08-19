import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatNumber } from "./format";
import { intlTag, toSupportedLocale } from "./locales";

describe("locale resolution", () => {
  it("falls back to the reference locale for anything unsupported", () => {
    expect(toSupportedLocale("sv")).toBe("sv");
    expect(toSupportedLocale("pt")).toBe("es");
    expect(toSupportedLocale(undefined)).toBe("es");
  });

  it("keeps Spanish Paraguayan for Intl", () => {
    expect(intlTag("es")).toBe("es-PY");
    expect(intlTag("en")).toBe("en-US");
  });
});

describe("formatters", () => {
  it("groups numbers per locale", () => {
    // Only the separators may differ — the digits never do.
    for (const locale of ["es", "en", "sv"]) {
      expect(formatNumber(1234567, locale).replace(/\D/g, "")).toBe("1234567");
    }
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
  });

  it("keeps the currency code beside the amount", () => {
    expect(formatMoney(50000, "PYG", "es")).toContain("PYG");
  });

  it("formats a date in the tenant timezone, not the runtime one", () => {
    // 2026-01-01T02:00:00Z is still 2025-12-31 in Asunción (UTC-3).
    expect(formatDate("2026-01-01T02:00:00.000Z", "es")).toBe("31/12/2025");
  });
});
