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

// Platform-level audit trail (PLAN.md §4 "infra"). Every impersonated action
// is written here with both the real actor and the effective (impersonated)
// user — §3.2. Nullable tenant_id lets platform-level actions (e.g. tenant
// creation) be logged too, filterable per tenant in the superadmin console.
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }),
    actorUserId: char("actor_user_id", { length: 26 }).notNull(),
    impersonatorUserId: char("impersonator_user_id", { length: 26 }),
    action: varchar("action", { length: 100 }).notNull(),
    entity: varchar("entity", { length: 100 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }).notNull(),
    payload: json("payload").notNull().default({}),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_log_tenant_id_idx").on(table.tenantId),
    index("audit_log_entity_idx").on(table.entity, table.entityId),
  ],
);

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
