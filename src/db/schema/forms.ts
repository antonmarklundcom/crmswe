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

export const formSubmissions = mysqlTable(
  "form_submissions",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    formId: char("form_id", { length: 26 }).notNull(),
    contactId: char("contact_id", { length: 26 }).notNull(),
    data: json("data").notNull().default({}),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 500 }),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("form_submissions_tenant_id_idx").on(table.tenantId),
    index("form_submissions_form_id_idx").on(table.formId),
    index("form_submissions_contact_id_idx").on(table.contactId),
  ],
);
