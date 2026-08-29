import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatNumber } from "./format";
import { intlTag, toSupportedLocale } from "./locales";

describe("locale resolution", () => {
  it("falls back to the reference locale for anything unsupported", () => {
    expect(toSupportedLocale("sv")).toBe("sv");
    expect(toSupportedLocale("pt")).toBe("sv");
    expect(toSupportedLocale(undefined)).toBe("sv");
  });

  it("maps every supported locale to its Intl tag", () => {
    expect(intlTag("sv")).toBe("sv-SE");
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

  it("renders minor units as a real currency amount", () => {
    // 12 500,00 kr held as öre — the exit criterion of plan.md §5.1.
    expect(formatMoney(1250000, "SEK", "sv").replace(/\u00a0/g, " ")).toBe("12 500,00 kr");
    // A currency with no minor unit invents no decimals.
    expect(formatMoney(1500000, "PYG", "es").replace(/\D/g, "")).toBe("1500000");
    // The same amount, any locale: same digits, different presentation.
    expect(formatMoney(1250000, "SEK", "en").replace(/\D/g, "")).toBe("1250000");
  });

  it("formats a date in the tenant timezone, not the runtime one", () => {
    // 2025-12-31T23:30:00Z is already 2026-01-01 in Stockholm (UTC+1).
    expect(formatDate("2025-12-31T23:30:00.000Z", "sv")).toBe("2026-01-01");
    // …and an explicit tenant timezone still overrides the default.
    expect(formatDate("2026-01-01T02:00:00.000Z", "es", undefined, "America/Asuncion")).toBe(
      "31/12/2025",
    );
  });
});
