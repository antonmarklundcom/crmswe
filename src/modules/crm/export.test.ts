import { describe, expect, it } from "vitest";
import { toCsv } from "./export";

// Pure CSV assembly — no DB. The cases here are the ones that actually
// corrupt a spreadsheet, not hypothetical ones.

describe("toCsv", () => {
  it("writes a header row and CRLF line endings", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("a,b\r\n1,2");
  });

  it("quotes values containing commas, quotes or newlines", () => {
    expect(toCsv(["x"], [["Gómez, María"]])).toBe('x\r\n"Gómez, María"');
    expect(toCsv(["x"], [['dijo "hola"']])).toBe('x\r\n"dijo ""hola"""');
    expect(toCsv(["x"], [["línea1\nlínea2"]])).toBe('x\r\n"línea1\nlínea2"');
  });

  it("neutralizes formula injection", () => {
    // A contact named =IMPORTXML(...) must not execute when an admin opens
    // the export in Sheets or Excel.
    expect(toCsv(["x"], [['=IMPORTXML("evil","//x")']])).toContain("'=IMPORTXML");
    for (const prefix of ["=", "+", "-", "@"]) {
      expect(toCsv(["x"], [[`${prefix}test`]])).toBe(`x\r\n'${prefix}test`);
    }
  });

  it("keeps E.164 phones intact", () => {
    // Without neutralizing the leading +, Sheets evaluates +595981234567 as
    // a number and the phone loses its format — the single most common cell
    // in this product.
    expect(toCsv(["telefono"], [["+595981234567"]])).toBe(
      "telefono\r\n'+595981234567",
    );
  });

  it("renders empty cells for null and undefined", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toBe("a,b\r\n,");
  });

  it("serializes dates as ISO", () => {
    const date = new Date("2026-07-31T12:00:00.000Z");
    expect(toCsv(["creado"], [[date]])).toBe("creado\r\n2026-07-31T12:00:00.000Z");
  });
});
