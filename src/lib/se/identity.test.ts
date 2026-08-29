import { describe, expect, it } from "vitest";
import {
  formatBankgiro,
  formatOrgNr,
  formatPlusgiro,
  generateOcrNumber,
  isCompanyOrgNr,
  isLuhnValid,
  isValidBankgiro,
  isValidOcrNumber,
  isValidOrgNr,
  isValidPersonnummer,
  isValidPlusgiro,
  luhnCheckDigit,
  momsRegNrFromOrgNr,
  toTenDigits,
} from "./identity";

// Fixtures are real-format numbers with genuine check digits — a validator
// tested only against made-up digits passes while rejecting every real
// customer. 556012-5790 is Volvo AB's org.nr; 811218-9876 is Skatteverket's
// own published personnummer example.
const ORG_NR = "5560125790";
const ORG_NR_2 = "5567037485";
const PERSONNUMMER = "8112189876";
const SAMORDNINGSNUMMER = "7010632391";

describe("luhn", () => {
  it("computes the check digit that completes a number", () => {
    expect(luhnCheckDigit(ORG_NR.slice(0, 9))).toBe(0);
    expect(luhnCheckDigit(PERSONNUMMER.slice(0, 9))).toBe(6);
  });

  it("accepts a complete number and rejects a single-digit typo", () => {
    expect(isLuhnValid(ORG_NR)).toBe(true);
    expect(isLuhnValid("5560125791")).toBe(false);
    // Transposition, the other typo Luhn is there to catch.
    expect(isLuhnValid("5560127590")).toBe(false);
  });

  it("rejects input too short to carry a check digit", () => {
    expect(isLuhnValid("")).toBe(false);
    expect(isLuhnValid("7")).toBe(false);
  });
});

describe("toTenDigits", () => {
  it("accepts every written form of the same number", () => {
    for (const written of [
      "5560125790",
      "556012-5790",
      "556012 5790",
      "165560125790",
      "16 556012-5790",
    ]) {
      expect(toTenDigits(written)).toBe(ORG_NR);
    }
  });

  it("strips a personnummer century prefix", () => {
    expect(toTenDigits("198112189876")).toBe(PERSONNUMMER);
    expect(toTenDigits("19811218-9876")).toBe(PERSONNUMMER);
  });

  it("rejects a wrong length or an impossible century", () => {
    expect(toTenDigits("55601257")).toBeNull();
    expect(toTenDigits("175560125790")).toBeNull();
  });
});

describe("org.nr", () => {
  it("validates real numbers in any written form", () => {
    expect(isValidOrgNr("556012-5790")).toBe(true);
    expect(isValidOrgNr("5567037485")).toBe(true);
    expect(isValidOrgNr("165560125790")).toBe(true);
  });

  it("rejects a bad check digit and a malformed length", () => {
    expect(isValidOrgNr("556012-5791")).toBe(false);
    expect(isValidOrgNr("559156-2991")).toBe(false);
    expect(isValidOrgNr("556012-579")).toBe(false); // nine digits is not an org.nr
    expect(isValidOrgNr("556012")).toBe(false);
    expect(isValidOrgNr("")).toBe(false);
  });

  it("accepts an enskild firma's personnummer-shaped org.nr (plan.md §1.9)", () => {
    expect(isValidOrgNr(PERSONNUMMER)).toBe(true);
    expect(isCompanyOrgNr(PERSONNUMMER)).toBe(false);
    expect(isCompanyOrgNr(ORG_NR)).toBe(true);
  });

  it("formats with the hyphen and refuses to format an invalid number", () => {
    expect(formatOrgNr("5560125790")).toBe("556012-5790");
    expect(formatOrgNr("165560125790")).toBe("556012-5790");
    expect(formatOrgNr("556012-5791")).toBeNull();
  });

  it("derives the momsregistreringsnummer", () => {
    expect(momsRegNrFromOrgNr("556012-5790")).toBe("SE556012579001");
    expect(momsRegNrFromOrgNr(ORG_NR_2)).toBe("SE556703748501");
    expect(momsRegNrFromOrgNr("556012-5791")).toBeNull();
  });
});

describe("personnummer", () => {
  it("accepts a valid number and a samordningsnummer (day + 60)", () => {
    expect(isValidPersonnummer("811218-9876")).toBe(true);
    expect(isValidPersonnummer("19811218-9876")).toBe(true);
    expect(isValidPersonnummer(SAMORDNINGSNUMMER)).toBe(true);
  });

  it("rejects an impossible date even when the check digit is right", () => {
    // A company org.nr has a "month" of 20+, which is never a date.
    expect(isValidPersonnummer(ORG_NR)).toBe(false);
    expect(isValidPersonnummer("811318-9876")).toBe(false);
  });

  it("rejects a bad check digit", () => {
    expect(isValidPersonnummer("811218-9875")).toBe(false);
  });
});

describe("bankgiro & plusgiro", () => {
  it("validates and formats a bankgiro", () => {
    // 5402-9681 and 236-0550 are Luhn-correct bankgiro forms.
    expect(isValidBankgiro("54029681")).toBe(true);
    expect(formatBankgiro("54029681")).toBe("5402-9681");
    expect(formatBankgiro("2360550")).toBe("236-0550");
    expect(isValidBankgiro("5402-9682")).toBe(false);
    expect(formatBankgiro("5402968")).toBeNull();
  });

  it("validates and formats a plusgiro", () => {
    expect(isValidPlusgiro("4468336")).toBe(true);
    expect(formatPlusgiro("4468336")).toBe("446833-6");
    expect(isValidPlusgiro("4468332")).toBe(false);
    expect(formatPlusgiro("15 55 64")).toBe("15556-4");
  });
});

describe("OCR", () => {
  it("appends a length digit and a Luhn check digit", () => {
    const ocr = generateOcrNumber("FA-000123");
    expect(isValidOcrNumber(ocr)).toBe(true);
    // 123 → body "123"; the finished OCR is five digits, so the length
    // digit is 5 and the Luhn digit completes "1235".
    expect(ocr).toBe("12351");
  });

  it("round-trips every invoice number in a long sequence", () => {
    for (let n = 1; n <= 2000; n++) {
      const ocr = generateOcrNumber(`FA-${String(n).padStart(6, "0")}`);
      expect(isValidOcrNumber(ocr)).toBe(true);
      expect(ocr.length).toBeGreaterThanOrEqual(4);
      expect(ocr.length).toBeLessThanOrEqual(25);
    }
  });

  it("rejects a mistyped or truncated OCR", () => {
    const ocr = generateOcrNumber("000199");
    expect(isValidOcrNumber(ocr)).toBe(true);
    // Change one digit: Luhn catches it.
    const typo = `${ocr.slice(0, -2)}${(Number(ocr[ocr.length - 2]) + 1) % 10}${ocr.slice(-1)}`;
    expect(isValidOcrNumber(typo)).toBe(false);
    // Drop a digit: the length digit catches it even if Luhn happens to pass.
    expect(isValidOcrNumber(ocr.slice(1))).toBe(false);
    expect(isValidOcrNumber("")).toBe(false);
  });

  it("refuses a reference with no digits rather than printing an empty OCR", () => {
    expect(() => generateOcrNumber("FA-")).toThrow();
  });
});
