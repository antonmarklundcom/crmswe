import { describe, expect, it } from "vitest";
import {
  computeLineTotals,
  currencyMinorUnitDigits,
  formatMoneyInput,
  minorUnitsToDecimalString,
  parseMoneyInput,
  parseQuantity,
  previewTotals,
} from "./money";

// The builders post raw strings and the server recomputes from them. Since
// plan.md §1.2 amounts are minor units — öre for SEK — so what the user types
// ("1 495,50") and what is stored (149550) are two different numbers, and the
// gap between them is exactly where a 100× error lives. These tests pin that
// crossing down.

describe("currencyMinorUnitDigits", () => {
  it("knows SEK has öre and PYG does not", () => {
    expect(currencyMinorUnitDigits("SEK")).toBe(2);
    expect(currencyMinorUnitDigits("EUR")).toBe(2);
    expect(currencyMinorUnitDigits("PYG")).toBe(0);
  });

  it("falls back to two digits for an unknown code rather than throwing", () => {
    expect(currencyMinorUnitDigits("XXZ")).toBe(2);
  });
});

describe("minorUnitsToDecimalString", () => {
  it("converts without floating point", () => {
    expect(minorUnitsToDecimalString(149500, 2)).toBe("1495.00");
    expect(minorUnitsToDecimalString(5, 2)).toBe("0.05");
    expect(minorUnitsToDecimalString(0, 2)).toBe("0.00");
    expect(minorUnitsToDecimalString(-2550, 2)).toBe("-25.50");
    expect(minorUnitsToDecimalString(1500000, 0)).toBe("1500000");
    // The classic float failure: 0.1 + 0.2 never enters the picture.
    expect(minorUnitsToDecimalString(1234567890123, 2)).toBe("12345678901.23");
  });
});

describe("parseMoneyInput", () => {
  it("reads kronor and returns öre", () => {
    expect(parseMoneyInput("1495", "SEK")).toBe(149500);
    expect(parseMoneyInput("1495,50", "SEK")).toBe(149550);
    expect(parseMoneyInput("1 495,50", "SEK")).toBe(149550);
    expect(parseMoneyInput("1 495,5", "SEK")).toBe(149550);
    expect(parseMoneyInput("1 234 567,89", "SEK")).toBe(123456789);
    expect(parseMoneyInput("0", "SEK")).toBe(0);
    expect(parseMoneyInput("0,05", "SEK")).toBe(5);
    expect(parseMoneyInput("-200", "SEK")).toBe(-20000);
  });

  it("reads the machine form our own CSV export writes", () => {
    expect(parseMoneyInput("1495.50", "SEK")).toBe(149550);
    expect(parseMoneyInput("1495.00", "SEK")).toBe(149500);
  });

  it("reads a lone dot before three digits as a thousands separator", () => {
    // Inherited Paraguayan data writes 1.500.000 for one and a half million.
    expect(parseMoneyInput("1.500", "SEK")).toBe(150000);
    expect(parseMoneyInput("1.500.000", "SEK")).toBe(150000000);
    // …but 1.49 is a decimal, since no thousands group is two digits long.
    expect(parseMoneyInput("1.49", "SEK")).toBe(149);
  });

  it("strips a currency written next to the amount", () => {
    expect(parseMoneyInput("1 495 kr", "SEK")).toBe(149500);
    expect(parseMoneyInput("SEK 1495,50", "SEK")).toBe(149550);
  });

  it("respects the currency's own minor unit", () => {
    // PYG has none: the same string is a whole-guaraní amount.
    expect(parseMoneyInput("1500000", "PYG")).toBe(1500000);
    expect(parseMoneyInput("1500,50", "PYG")).toBeNull();
  });

  it("refuses rather than rounds when there are too many decimals", () => {
    expect(parseMoneyInput("1495,555", "SEK")).toBeNull();
  });

  it("rejects what is not an amount", () => {
    expect(parseMoneyInput("", "SEK")).toBeNull();
    expect(parseMoneyInput("   ", "SEK")).toBeNull();
    expect(parseMoneyInput("abc", "SEK")).toBeNull();
    expect(parseMoneyInput("1,2,3", "SEK")).toBeNull();
    expect(parseMoneyInput("9".repeat(20), "SEK")).toBeNull();
  });

  it("round-trips through formatMoneyInput", () => {
    for (const minor of [0, 5, 50, 149500, 149550, 100000000, -2550]) {
      expect(parseMoneyInput(formatMoneyInput(minor, "SEK"), "SEK")).toBe(minor);
    }
    expect(formatMoneyInput(149550, "SEK")).toBe("1495,50");
    expect(formatMoneyInput(1500000, "PYG")).toBe("1500000");
  });
});

describe("parseQuantity", () => {
  it("accepts what the server's coercion accepts", () => {
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity(" 42 ")).toBe(42);
    // Number("") is 0, exactly as z.coerce.number() reads a blank field.
    expect(parseQuantity("")).toBe(0);
  });

  it("rejects anything that isn't a whole number", () => {
    expect(parseQuantity("1.5")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
  });
});

describe("previewTotals", () => {
  const line = (over: Partial<{ description: string; qty: string; unitPrice: string }> = {}) => ({
    description: "Konsultation",
    qty: "2",
    unitPrice: "1500",
    ...over,
  });

  it("matches what the server computes from the same values", () => {
    const preview = previewTotals([line()], "500", "SEK");
    expect(preview).toEqual(
      computeLineTotals(
        [{ productId: undefined, description: "Konsultation", qty: 2, unitPrice: 150000 }],
        50000,
      ),
    );
    // 2 × 1 500,00 kr − 500,00 kr = 2 500,00 kr, held as öre.
    expect(preview!.total).toBe(250000);
  });

  it("ignores untouched blank rows, as the server does", () => {
    const preview = previewTotals([line(), line({ description: "  ", qty: "x" })], "0", "SEK");
    expect(preview!.subtotal).toBe(300000);
  });

  it("treats a cleared discount field as no discount", () => {
    expect(previewTotals([line()], "", "SEK")!.discount).toBe(0);
  });

  it("returns null rather than a total the server would refuse", () => {
    expect(previewTotals([line({ unitPrice: "150,005" })], "0", "SEK")).toBeNull();
    expect(previewTotals([line({ qty: "0" })], "0", "SEK")).toBeNull();
    expect(previewTotals([line({ qty: "1.5" })], "0", "SEK")).toBeNull();
    expect(previewTotals([line({ unitPrice: "-1" })], "0", "SEK")).toBeNull();
    expect(previewTotals([line()], "abc", "SEK")).toBeNull();
  });

  it("clamps an over-large discount instead of going negative", () => {
    expect(previewTotals([line({ qty: "1", unitPrice: "10" })], "50", "SEK")!.total).toBe(0);
  });
});
