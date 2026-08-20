import mysql from "mysql2/promise";
import { z } from "zod";
import * as schema from "@/db/schema";
import {
  evaluateRestore,
  formatReport,
  schemaTableNames,
  type RestoreObservation,
} from "@/db/restore-check";
import { forceIpv4Loopback } from "@/db/url";

// Backup-restore verification (docs/BACKUPS.md §2, PLAN.md §10 1R operator
// tasks). "An unverified backup is not a backup" — this turns that runbook's
// manual spot-check into something with an exit code, so it can be run on a
// schedule and its failure noticed.
//
// Point it at a *throwaway* database that a backup was just restored into,
// never at production: it proves the restore is real by asserting that every
// table in the Drizzle schema exists, that the tables a live CRM cannot have
// empty are populated, and that the newest contact/deal is recent enough that
// the backup isn't a stale file with a fresh timestamp.
//
// Read-only — it issues nothing but SELECTs.
//
// Usage:
//   RESTORE_DATABASE_URL=mysql://user:pass@host:3306/vendercrm_restore_test \
//   npx tsx scripts/verify-restore.ts
//
// Optional:
//   RESTORE_MAX_AGE_HOURS=48        how old the newest row may be (default 48)
//   RESTORE_EXPECT_ROWS=a,b,c       tables that must be non-empty
//   RESTORE_FRESH_TABLES=a,b        tables whose newest row dates the backup
//   RESTORE_ALLOW_PRODUCTION_URL=1  skip the "this is the live database" guard

// `.default()` sits before `.transform()` so the fallback is parsed the same
// way an operator-supplied value is, rather than bypassing the split.
const csv = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) => value.split(",").map((entry) => entry.trim()).filter(Boolean));

const configSchema = z.object({
  RESTORE_DATABASE_URL: z
    .string({ error: "RESTORE_DATABASE_URL is required — see the script header" })
    .min(1, "RESTORE_DATABASE_URL is required — see the script header"),
  RESTORE_MAX_AGE_HOURS: z.coerce.number().positive().default(48),
  // tenants/users prove the tenancy layer restored; contacts/deals prove the
  // CRM data itself did. A restore missing any of these is structure without
  // substance, whatever the file size said.
  RESTORE_EXPECT_ROWS: csv("tenants,users,contacts,deals"),
  RESTORE_FRESH_TABLES: csv("contacts,deals"),
  RESTORE_ALLOW_PRODUCTION_URL: z
    .enum(["0", "1", "true", "false"])
    .default("0")
    .transform((value) => value === "1" || value === "true"),
});

function sameTarget(a: string, b: string): boolean {
  try {
    const [left, right] = [new URL(a), new URL(b)];
    return (
      left.host === right.host && left.pathname.toLowerCase() === right.pathname.toLowerCase()
    );
  } catch {
    return a === b;
  }
}

async function main(): Promise<number> {
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      console.error(`${issue.path.join(".") || "config"}: ${issue.message}`);
    }
    process.exit(2);
  }
  const config = parsed.data;

  // Verifying the live database proves nothing about the backup, and is the
  // easy mistake to make when both URLs are in the same shell.
  const live = process.env.DATABASE_URL;
  if (live && sameTarget(live, config.RESTORE_DATABASE_URL) && !config.RESTORE_ALLOW_PRODUCTION_URL) {
    console.error(
      "RESTORE_DATABASE_URL points at the same database as DATABASE_URL. Restore the\n" +
        "backup into a throwaway database first (docs/BACKUPS.md §2), or set\n" +
        "RESTORE_ALLOW_PRODUCTION_URL=1 if this really is what you meant.",
    );
    process.exit(2);
  }

  const schemaTables = schemaTableNames(schema);
  const connection = await mysql.createConnection(
    forceIpv4Loopback(config.RESTORE_DATABASE_URL),
  );

  try {
    const [dbRows] = await connection.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS db");
    const database = dbRows[0]?.db as string | null;
    if (!database) {
      console.error("RESTORE_DATABASE_URL names no database (no schema in the connection URL).");
      return 2;
    }
    console.log(`Verifying restored database: ${database}\n`);

    const [tableRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ?",
      [database],
    );
    const presentTables = tableRows.map((row) => String(row.name));
    const present = new Set(presentTables);

    const observation: RestoreObservation = {
      presentTables,
      rowCounts: {},
      freshness: {},
    };

    // Counted for every schema table, not just the ones with an expectation:
    // the counts are the report's evidence, and a table nobody thought to
    // list is exactly where an unnoticed empty shows up.
    for (const table of schemaTables) {
      if (!present.has(table)) continue;
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS count FROM ${mysql.escapeId(table)}`,
      );
      observation.rowCounts[table] = Number(rows[0]?.count ?? 0);
    }

    for (const table of config.RESTORE_FRESH_TABLES) {
      if (!present.has(table)) continue;
      // NOW() and MAX(created_at) are both the restored server's clock, so
      // this measures staleness rather than the offset between two machines'
      // timezones (created_at is a zone-less DATETIME).
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT MAX(created_at) AS latest,
                TIMESTAMPDIFF(SECOND, MAX(created_at), NOW()) AS age
           FROM ${mysql.escapeId(table)}`,
      );
      const latest = rows[0]?.latest as Date | string | null;
      observation.freshness[table] = {
        latest: latest === null || latest === undefined ? null : formatTimestamp(latest),
        ageSeconds: rows[0]?.age === null || rows[0]?.age === undefined ? null : Number(rows[0].age),
      };
    }

    const checks = evaluateRestore(observation, {
      schemaTables,
      expectNonEmpty: config.RESTORE_EXPECT_ROWS,
      freshnessTables: config.RESTORE_FRESH_TABLES,
      maxAgeSeconds: config.RESTORE_MAX_AGE_HOURS * 3600,
    });

    console.log("Row counts:");
    for (const table of schemaTables) {
      const count = observation.rowCounts[table];
      console.log(`  ${table.padEnd(24)} ${count === undefined ? "(table missing)" : count}`);
    }
    console.log("");
    console.log(formatReport(checks));

    return checks.every((check) => check.ok) ? 0 : 1;
  } finally {
    await connection.end();
  }
}

function formatTimestamp(value: Date | string): string {
  // mysql2 returns DATETIME as a Date built from the zone-less value; render
  // it back the way the database stated it rather than in the client's zone.
  if (typeof value === "string") return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ` +
    `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  );
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(2);
  });
