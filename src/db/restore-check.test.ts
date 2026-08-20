import { describe, expect, it } from "vitest";
import * as schema from "./schema";
import {
  evaluateRestore,
  formatReport,
  schemaTableNames,
  type RestoreExpectation,
  type RestoreObservation,
} from "./restore-check";

const HOUR = 3600;

const expectation: RestoreExpectation = {
  schemaTables: ["contacts", "deals", "tenants"],
  expectNonEmpty: ["tenants", "contacts"],
  freshnessTables: ["contacts"],
  maxAgeSeconds: 48 * HOUR,
};

function observation(overrides: Partial<RestoreObservation> = {}): RestoreObservation {
  return {
    presentTables: ["contacts", "deals", "tenants"],
    rowCounts: { tenants: 3, contacts: 120, deals: 44 },
    freshness: { contacts: { latest: "2026-08-20 09:00:00", ageSeconds: 2 * HOUR } },
    ...overrides,
  };
}

function check(observed: RestoreObservation, name: string) {
  const found = evaluateRestore(observed, expectation).find((c) => c.name === name);
  if (!found) throw new Error(`No check named ${name}`);
  return found;
}

describe("schemaTableNames", () => {
  it("derives table names from the real Drizzle schema", () => {
    const names = schemaTableNames(schema);
    // Spot-check across schema files rather than pinning the whole list — a
    // new table must not need this test updated to be covered.
    expect(names).toEqual(expect.arrayContaining(["tenants", "contacts", "deals", "jobs"]));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("evaluateRestore", () => {
  it("passes a healthy restore", () => {
    expect(evaluateRestore(observation(), expectation).every((c) => c.ok)).toBe(true);
  });

  it("fails and names every missing schema table", () => {
    const result = check(observation({ presentTables: ["tenants"] }), "schema tables present");
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("contacts");
    expect(result.detail).toContain("deals");
  });

  it("fails an empty table — a structure-only restore", () => {
    const result = check(
      observation({ rowCounts: { tenants: 3, contacts: 0, deals: 0 } }),
      "rows in contacts",
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("0 row(s)");
  });

  it("fails a row count that was never collected", () => {
    expect(check(observation({ rowCounts: { tenants: 3 } }), "rows in contacts").ok).toBe(false);
  });

  it("fails a stale backup", () => {
    const result = check(
      observation({
        freshness: { contacts: { latest: "2026-08-01 09:00:00", ageSeconds: 72 * HOUR } },
      }),
      "contacts freshness",
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("3.0d ago");
  });

  it("accepts a newest row exactly at the age limit", () => {
    const result = check(
      observation({
        freshness: { contacts: { latest: "2026-08-18 09:00:00", ageSeconds: 48 * HOUR } },
      }),
      "contacts freshness",
    );
    expect(result.ok).toBe(true);
  });

  it("fails freshness when the table is empty rather than reporting an age", () => {
    const result = check(
      observation({ freshness: { contacts: { latest: null, ageSeconds: null } } }),
      "contacts freshness",
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("no rows");
  });

  it("fails both row and freshness checks when the table is missing entirely", () => {
    const observed = observation({ presentTables: ["tenants", "deals"] });
    expect(check(observed, "rows in contacts").ok).toBe(false);
    expect(check(observed, "contacts freshness").detail).toContain("does not exist");
  });
});

describe("formatReport", () => {
  it("summarizes a passing run", () => {
    const report = formatReport(evaluateRestore(observation(), expectation));
    expect(report).toContain("PASS");
    expect(report).not.toContain("FAIL");
    expect(report).toContain("check(s) passed");
  });

  it("names the failing checks in the summary line", () => {
    const report = formatReport(
      evaluateRestore(observation({ rowCounts: { tenants: 0, contacts: 0 } }), expectation),
    );
    expect(report).toContain("FAILED: rows in tenants, rows in contacts");
  });
});
