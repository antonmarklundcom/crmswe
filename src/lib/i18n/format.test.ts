import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatNumber } from "./format";
import { money } from "@/modules/renderable-document/format";
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

  it("renders money the same way everywhere it is printed", () => {
    // One renderer for the UI, the PDFs and the public pages (PLAN.md §14
    // I2 #1) — the document helper is the same function, not a second
    // format that happens to look similar.
    for (const locale of ["es", "en", "sv"]) {
      expect(money(1500000, "PYG", locale)).toBe(formatMoney(1500000, "PYG", locale));
    }
  });

  it("gives each currency the fraction digits it actually has", () => {
    // PYG is a zero-decimal currency; SEK and USD are not. The old UI
    // renderer gave all of them none, so a kronor amount printed as if \u00f6re
    // did not exist.
    expect(formatMoney(1500000, "PYG", "es").replace(/\u00a0/g, " ")).toBe("Gs. 1.500.000");
    expect(formatMoney(123450, "USD", "es").replace(/\u00a0/g, " ")).toBe("USD 1.234,50");
    expect(formatMoney(123450, "USD", "en").replace(/\u00a0/g, " ")).toBe("$1,234.50");
  });

  it("puts the symbol where the reader's language puts it", () => {
    // Intl trails the symbol in Swedish ("kr" after the amount) and leads it
    // in Spanish/English ("SEK"/"$" before) \u2014 a caller normalises the
    // non-breaking space Intl inserts, never the position.
    expect(formatMoney(1250000, "SEK", "sv").replace(/\u00a0/g, " ")).toBe("12 500,00 kr");
    expect(formatMoney(50000, "SEK", "es").replace(/\u00a0/g, " ")).toBe("SEK 500,00");
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
