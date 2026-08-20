import { getTableName, is } from "drizzle-orm";
import { MySqlTable } from "drizzle-orm/mysql-core";

// The decision logic behind scripts/verify-restore.ts (docs/BACKUPS.md §2),
// kept separate from the script so it can be unit-tested without a MySQL to
// point at — same split as db/url.ts and lib/money.ts. Everything here is
// pure: the script gathers observations from the restored database and hands
// them in; this module decides whether the restore is real.

/** One assertion about the restored database, as it appears in the report. */
export type RestoreCheck = {
  name: string;
  ok: boolean;
  /** Human-readable evidence — the number that was seen, not a restatement. */
  detail: string;
};

/** What the script measured against the restored database. */
export type RestoreObservation = {
  /** Table names present in the restored schema (information_schema). */
  presentTables: string[];
  /** Row count per table, for the tables the script counted. */
  rowCounts: Record<string, number>;
  /**
   * Per table, how far in the past the newest `created_at` is, measured by
   * the restored server's own clock (`TIMESTAMPDIFF(SECOND, MAX(...), NOW())`).
   * `null` latest means the table had no rows. Using the server's clock
   * rather than comparing timestamps here is deliberate: `created_at` is a
   * MySQL DATETIME with no zone, so a client-side comparison would silently
   * measure the gap between two machines' timezones instead of staleness.
   */
  freshness: Record<string, { latest: string | null; ageSeconds: number | null }>;
};

export type RestoreExpectation = {
  /** Every table the Drizzle schema defines — all of them must exist. */
  schemaTables: string[];
  /** Tables a real restore cannot have empty. */
  expectNonEmpty: string[];
  /** Tables whose newest row proves the backup isn't stale. */
  freshnessTables: string[];
  /** How old the newest row may be before the backup counts as stale. */
  maxAgeSeconds: number;
};

/**
 * Table names defined by the Drizzle schema, derived from the schema module
 * itself rather than a hand-kept list — a table added in a later migration is
 * covered here the day it lands, with nothing to remember to update.
 */
export function schemaTableNames(schema: Record<string, unknown>): string[] {
  const names = new Set<string>();
  for (const value of Object.values(schema)) {
    if (is(value, MySqlTable)) names.add(getTableName(value));
  }
  return [...names].sort();
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86_400).toFixed(1)}d`;
}

function formatAge(seconds: number): string {
  // A negative age means the newest row is stamped ahead of the restored
  // server's clock — worth saying out loud rather than rendering as "-1.0d
  // ago", since it usually means the two machines disagree about the time.
  if (seconds < 0) return `${formatDuration(Math.abs(seconds))} in the future`;
  return `${formatDuration(seconds)} ago`;
}

export function evaluateRestore(
  observation: RestoreObservation,
  expectation: RestoreExpectation,
): RestoreCheck[] {
  const checks: RestoreCheck[] = [];
  const present = new Set(observation.presentTables);

  const missing = expectation.schemaTables.filter((table) => !present.has(table));
  checks.push({
    name: "schema tables present",
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? `all ${expectation.schemaTables.length} tables in the Drizzle schema exist`
        : `${missing.length} of ${expectation.schemaTables.length} missing: ${missing.join(", ")}`,
  });

  for (const table of expectation.expectNonEmpty) {
    if (!present.has(table)) {
      checks.push({
        name: `rows in ${table}`,
        ok: false,
        detail: "table does not exist in the restored database",
      });
      continue;
    }
    const count = observation.rowCounts[table];
    if (count === undefined) {
      checks.push({
        name: `rows in ${table}`,
        ok: false,
        detail: "row count was not collected",
      });
      continue;
    }
    checks.push({
      name: `rows in ${table}`,
      ok: count > 0,
      // A count of 0 is the failure this check exists for: an empty table in
      // a schema-complete database is what a restore of only the structure
      // (mysqldump --no-data, or an import that stopped after the DDL) looks
      // like.
      detail: `${count} row(s)`,
    });
  }

  for (const table of expectation.freshnessTables) {
    const name = `${table} freshness`;
    if (!present.has(table)) {
      checks.push({ name, ok: false, detail: "table does not exist in the restored database" });
      continue;
    }
    const observed = observation.freshness[table];
    if (!observed || observed.latest === null || observed.ageSeconds === null) {
      checks.push({
        name,
        ok: false,
        detail: "no rows, so the backup's age can't be established",
      });
      continue;
    }
    const ok = observed.ageSeconds <= expectation.maxAgeSeconds;
    checks.push({
      name,
      ok,
      detail: `newest row ${observed.latest} (${formatAge(observed.ageSeconds)}, limit ${formatDuration(expectation.maxAgeSeconds)})`,
    });
  }

  return checks;
}

export function formatReport(checks: RestoreCheck[]): string {
  const width = Math.max(0, ...checks.map((check) => check.name.length));
  const lines = checks.map(
    (check) => `${check.ok ? "PASS" : "FAIL"}  ${check.name.padEnd(width)}  ${check.detail}`,
  );
  const failed = checks.filter((check) => !check.ok);
  lines.push("");
  lines.push(
    failed.length === 0
      ? `All ${checks.length} check(s) passed — this restore is usable.`
      : `${failed.length} of ${checks.length} check(s) FAILED: ${failed.map((check) => check.name).join(", ")}`,
  );
  return lines.join("\n");
}
