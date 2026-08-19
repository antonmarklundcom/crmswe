import { describe, expect, it } from "vitest";
import { guessMapping, parseCsv } from "./import";

// Parsing is the half that has to survive whatever the old CRM exported, so
// it's tested without a database (PLAN.md §13 H6). The import itself, which
// writes, is covered by import.integration.test.ts.

describe("parseCsv", () => {
  it("reads a plain file", () => {
    const { headers, rows } = parseCsv("nombre,telefono\nAna,0981123456\nBeto,0982222222\n");
    expect(headers).toEqual(["nombre", "telefono"]);
    expect(rows).toEqual([
      { nombre: "Ana", telefono: "0981123456" },
      { nombre: "Beto", telefono: "0982222222" },
    ]);
  });

  it("survives what Excel and old CRMs actually emit", () => {
    // BOM, CRLF, a quoted comma, a quoted newline, and an escaped quote.
    const csv =
      '﻿name,notes\r\n"Doe, Ana","line one\nline two"\r\n"Beto","he said ""hola"""\r\n';
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["name", "notes"]);
    expect(rows[0]).toEqual({ name: "Doe, Ana", notes: "line one\nline two" });
    expect(rows[1]).toEqual({ name: "Beto", notes: 'he said "hola"' });
  });

  it("ignores blank lines and pads short rows", () => {
    const { rows } = parseCsv("a,b,c\n1,2\n\n4,5,6\n");
    expect(rows).toEqual([
      { a: "1", b: "2", c: "" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
    expect(parseCsv("\n\n")).toEqual({ headers: [], rows: [] });
  });
});

describe("guessMapping", () => {
  it("pre-fills the Spanish headers a local spreadsheet uses", () => {
    expect(guessMapping(["Nombre", "Teléfono", "Correo", "Observaciones"])).toEqual({
      name: "Nombre",
      phone: "Teléfono",
      email: "Correo",
      notes: "Observaciones",
    });
  });

  it("pre-fills a GoHighLevel-shaped export", () => {
    expect(guessMapping(["First Name", "Phone", "Email", "Source"])).toEqual({
      name: "First Name",
      phone: "Phone",
      email: "Email",
      source: "Source",
    });
  });

  it("leaves unknown headers unmapped rather than guessing", () => {
    expect(guessMapping(["col1", "col2"])).toEqual({});
  });
});
