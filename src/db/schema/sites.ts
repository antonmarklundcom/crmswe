import {
  mysqlTable,
  char,
  varchar,
  boolean,
  json,
  datetime,
  index,
  uniqueIndex,
  text,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Multi-site lead ingest (PLAN.md §5.1). One tenant owns many sites — the
// owner's whole Paraguayan lead-gen network is a single tenant, and every
// lead carries site_id for filtering and attribution.

export const sites = mysqlTable(
  "sites",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    domain: varchar("domain", { length: 255 }),
    // SHA-256 of the API key. The key is high-entropy random, not a
    // password, so a slow KDF buys nothing (§5.1). Unique platform-wide:
    // key → site → tenant is the ingest routing lookup.
    apiKeyHash: char("api_key_hash", { length: 64 }).notNull(),
    // First few chars of the plaintext key, kept purely so the UI can label
    // which key is which after the one-time reveal.
    apiKeyPrefix: varchar("api_key_prefix", { length: 16 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    // Per-site routing defaults, configured in the CRM and never accepted
    // from the caller — a leaked key can't reshape someone's pipeline.
    // Different sites are different businesses (dentista vs materiales), so
    // each normally points at its own pipeline.
    defaultPipelineId: char("default_pipeline_id", { length: 26 }),
    defaultStageId: char("default_stage_id", { length: 26 }),
    defaultOwnerUserId: char("default_owner_user_id", { length: 26 }),
    defaultTagIds: json("default_tag_ids").notNull().default([]),
    // Which WhatsApp number this site's conversations run through. Each site
    // is usually its own brand with its own number; null falls back to the
    // tenant's primary account.
    waAccountId: char("wa_account_id", { length: 26 }),
    settings: json("settings").notNull().default({}),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("sites_tenant_id_idx").on(table.tenantId),
    uniqueIndex("sites_tenant_slug_idx").on(table.tenantId, table.slug),
    uniqueIndex("sites_api_key_hash_idx").on(table.apiKeyHash),
  ],
);

// One row per inbound lead, from either entry path (§5.1): the public API
// (site_id set) or a hosted form page (form_id set). Replaces the old
// form_submissions table so attribution and per-source stats live in one
// place instead of two near-identical tables every query would UNION.
export const leadSubmissions = mysqlTable(
  "lead_submissions",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    siteId: char("site_id", { length: 26 }),
    formId: char("form_id", { length: 26 }),
    contactId: char("contact_id", { length: 26 }).notNull(),
    dealId: char("deal_id", { length: 26 }),
    payload: json("payload").notNull().default({}),
    // utm_source/medium/campaign/term/content + gclid/fbclid (§5.1).
    utm: json("utm").notNull().default({}),
    pageUrl: varchar("page_url", { length: 2000 }),
    referrer: varchar("referrer", { length: 2000 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 500 }),
    // Caller-supplied dedupe key. Null for the hosted-form path, which has
    // no retrying client; MySQL allows repeated NULLs in a unique index, so
    // form rows never collide with each other.
    idempotencyKey: varchar("idempotency_key", { length: 100 }),
    notes: text("notes"),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("lead_submissions_tenant_id_idx").on(table.tenantId),
    index("lead_submissions_site_id_idx").on(table.siteId),
    index("lead_submissions_form_id_idx").on(table.formId),
    index("lead_submissions_contact_id_idx").on(table.contactId),
    // The idempotency guard (§5.1) — a retried POST is a no-op rather than a
    // duplicate contact, same discipline as wa_message_id in §6.3.
    uniqueIndex("lead_submissions_idempotency_idx").on(
      table.tenantId,
      table.siteId,
      table.idempotencyKey,
    ),
  ],
);
