import {
  mysqlTable,
  char,
  varchar,
  int,
  json,
  datetime,
  index,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Platform-level job queue (PLAN.md §2.1) — a `jobs` table drained by an
// in-process worker, no Redis. Delayed steps are just jobs with a future run_at.
export const jobs = mysqlTable(
  "jobs",
  {
    id: char("id", { length: 26 }).primaryKey(),
    type: varchar("type", { length: 100 }).notNull(),
    payload: json("payload").notNull(),
    tenantId: char("tenant_id", { length: 26 }),
    runAt: datetime("run_at").notNull(),
    status: varchar("status", {
      length: 20,
      enum: ["pending", "running", "done", "failed", "dead"],
    })
      .notNull()
      .default("pending"),
    attempts: int("attempts").notNull().default(0),
    maxAttempts: int("max_attempts").notNull().default(5),
    lockedAt: datetime("locked_at"),
    lockedBy: varchar("locked_by", { length: 100 }),
    lastError: varchar("last_error", { length: 2000 }),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("jobs_status_run_at_idx").on(table.status, table.runAt),
    index("jobs_type_idx").on(table.type),
  ],
);
