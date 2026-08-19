import { describe, expect, it } from "vitest";
import {
  CDC_FIELDS,
  CDC_LAYOUT,
  CDC_LENGTH,
  CdcError,
  composeCdc,
  generateSecurityCode,
  isValidCdc,
  parseCdc,
  type CdcInput,
} from "./cdc";
import { DOCUMENT_TYPES, EMISSION_TYPES, TAXPAYER_TYPES } from "./codes";
import { modulo11CheckDigit } from "./dv";

// A complete, valid input. Every test varies one field off this so a
// failure names the field that broke rather than "the CDC is wrong".
const base: CdcInput = {
  documentType: DOCUMENT_TYPES.factura,
  issuerRuc: "3535123-3",
  establishment: 1,
  pointOfSale: 1,
  documentNumber: 7,
  taxpayerType: TAXPAYER_TYPES.personaJuridica,
  emissionDate: "2026-08-19",
  emissionType: EMISSION_TYPES.normal,
  securityCode: "123456789",
};

describe("CDC layout", () => {
  it("is 11 fields summing to exactly 44 digits", () => {
    expect(CDC_FIELDS).toHaveLength(11);
    const total = CDC_FIELDS.reduce((sum, [, width]) => sum + width, 0);
    expect(total).toBe(CDC_LENGTH);
  });

  it("derives contiguous offsets with no gap or overlap", () => {
    let expected = 0;
    for (const [name, width] of CDC_FIELDS) {
      expect(CDC_LAYOUT[name]).toEqual({ offset: expected, width });
      expected += width;
    }
  });
});

describe("composeCdc", () => {
  it("builds the documented 44-digit string, field by field", () => {
    const cdc = composeCdc(base);

    // 01 | 03535123 | 3 | 001 | 001 | 0000007 | 2 | 20260819 | 1 | 123456789 | dv
    const body =
      "01" + "03535123" + "3" + "001" + "001" + "0000007" + "2" +
      "20260819" + "1" + "123456789";
    expect(body).toHaveLength(43);
    expect(cdc.value).toBe(`${body}${modulo11CheckDigit(body)}`);
    expect(cdc.value).toHaveLength(CDC_LENGTH);
  });

  it("left-zero-pads every fixed-width field", () => {
    const cdc = composeCdc({ ...base, establishment: 2, pointOfSale: 34, documentNumber: 561 });
    expect(cdc.value.slice(11, 14)).toBe("002");
    expect(cdc.value.slice(14, 17)).toBe("034");
    expect(cdc.value.slice(17, 24)).toBe("0000561");
  });

  it("accepts a RUC written without its check digit and fills it in", () => {
    expect(composeCdc({ ...base, issuerRuc: "3535123" }).value).toBe(
      composeCdc(base).value,
    );
  });

  it("refuses a RUC whose check digit is wrong", () => {
    // The document would be filed against a taxpayer that doesn't exist.
    expect(() => composeCdc({ ...base, issuerRuc: "3535123-4" })).toThrow(CdcError);
  });

  it("refuses to truncate a field that overflows", () => {
    // 8 digits into the 7-digit número — silently truncating would produce a
    // valid-looking CDC for a different document.
    expect(() => composeCdc({ ...base, documentNumber: 99_999_999 })).toThrow(CdcError);
    expect(() => composeCdc({ ...base, establishment: 1000 })).toThrow(CdcError);
  });

  it("rejects out-of-range and non-integer numbering", () => {
    expect(() => composeCdc({ ...base, establishment: 0 })).toThrow(CdcError);
    expect(() => composeCdc({ ...base, pointOfSale: -1 })).toThrow(CdcError);
    expect(() => composeCdc({ ...base, documentNumber: 1.5 })).toThrow(CdcError);
  });

  it("rejects dates that aren't real, not just badly shaped ones", () => {
    expect(() => composeCdc({ ...base, emissionDate: "19-08-2026" })).toThrow(CdcError);
    expect(() => composeCdc({ ...base, emissionDate: "2026-02-31" })).toThrow(CdcError);
    expect(() => composeCdc({ ...base, emissionDate: "2026-13-01" })).toThrow(CdcError);
  });

  it("rejects unknown code table values", () => {
    expect(() => composeCdc({ ...base, documentType: 99 as never })).toThrow(CdcError);
    expect(() => composeCdc({ ...base, emissionType: 0 as never })).toThrow(CdcError);
  });

  it("rejects a security code that isn't exactly 9 digits", () => {
    expect(() => composeCdc({ ...base, securityCode: "12345" })).toThrow(CdcError);
    expect(() => composeCdc({ ...base, securityCode: "12345678a" })).toThrow(CdcError);
  });

  it("generates a different security code each time when none is given", () => {
    const { securityCode, ...withoutCode } = base;
    void securityCode;
    const codes = new Set(
      Array.from({ length: 20 }, () => composeCdc(withoutCode).fields.securityCode),
    );
    // A fixed or missing generator would collapse this to one value.
    expect(codes.size).toBeGreaterThan(1);
    for (const code of codes) expect(code).toMatch(/^\d{9}$/);
  });
});

describe("parseCdc", () => {
  it("round-trips everything composeCdc produced", () => {
    const cdc = composeCdc(base);
    expect(parseCdc(cdc.value)).toEqual(cdc);
  });

  it("round-trips a padded document number back to its integer", () => {
    const cdc = composeCdc({ ...base, establishment: 2, pointOfSale: 34, documentNumber: 561 });
    expect(parseCdc(cdc.value).fields).toMatchObject({
      establishment: 2,
      pointOfSale: 34,
      documentNumber: 561,
      emissionDate: "2026-08-19",
    });
  });

  it("rejects a CDC whose check digit does not verify", () => {
    const cdc = composeCdc(base);
    const lastDigit = Number(cdc.value[43]);
    const tampered = cdc.value.slice(0, 43) + ((lastDigit + 1) % 10);
    expect(() => parseCdc(tampered)).toThrow(CdcError);
  });

  it("rejects a tampered body even when it is still 44 digits", () => {
    const cdc = composeCdc(base);
    const digit = Number(cdc.value[20]);
    const tampered =
      cdc.value.slice(0, 20) + ((digit + 1) % 10) + cdc.value.slice(21);
    expect(() => parseCdc(tampered)).toThrow(CdcError);
  });

  it("rejects the wrong length or non-digits", () => {
    expect(() => parseCdc("123")).toThrow(CdcError);
    expect(() => parseCdc("1".repeat(45))).toThrow(CdcError);
    expect(() => parseCdc("x".repeat(44))).toThrow(CdcError);
  });
});

describe("isValidCdc", () => {
  it("answers without throwing", () => {
    expect(isValidCdc(composeCdc(base).value)).toBe(true);
    expect(isValidCdc("nope")).toBe(false);
  });
});

describe("generateSecurityCode", () => {
  it("always returns 9 digits", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSecurityCode()).toMatch(/^\d{9}$/);
    }
  });
});
