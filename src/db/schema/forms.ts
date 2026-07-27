import {
  mysqlTable,
  char,
  varchar,
  boolean,
  json,
  datetime,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Public lead-capture forms (PLAN.md §4 "forms", §5). Submissions are
// unauthenticated by nature (public page, no session) — handled by the
// forms module directly against `db`, same pattern as tenancy/invitations.ts
// token lookup.
//
// Submissions themselves live in `lead_submissions` (schema/sites.ts): the
// hosted-form path and the public ingest API produce the same row so
// attribution and per-source stats have a single home (§5.1).

export const forms = mysqlTable(
  "forms",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    // Ordered field defs: [{ key, label, type, required }], type one of
    // text/phone/email/select/textarea (§4).
    fields: json("fields").notNull().default([]),
    // redirect URL, target pipeline/stage id, default tag ids (§4).
    settings: json("settings").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("forms_tenant_id_idx").on(table.tenantId),
    uniqueIndex("forms_tenant_slug_idx").on(table.tenantId, table.slug),
  ],
);
