import {
  mysqlTable,
  char,
  varchar,
  int,
  bigint,
  boolean,
  json,
  datetime,
  index,
  uniqueIndex,
  text,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// CRM core (PLAN.md §4 "crm", §5). All tenant-owned — every table carries
// tenant_id and is only ever reached through tenantDb(ctx) (§3.3).

export const pipelines = mysqlTable(
  "pipelines",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    position: int("position").notNull().default(0),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("pipelines_tenant_id_idx").on(table.tenantId)],
);

export const stages = mysqlTable(
  "stages",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    pipelineId: char("pipeline_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    position: int("position").notNull().default(0),
    color: varchar("color", { length: 20 }),
    isWon: boolean("is_won").notNull().default(false),
    isLost: boolean("is_lost").notNull().default(false),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("stages_tenant_id_idx").on(table.tenantId),
    index("stages_pipeline_id_idx").on(table.pipelineId),
  ],
);

// Phone (E.164) is the primary identity key (§5) — unique per tenant so the
// same number can't create two contacts, but two tenants can share a number.
export const contacts = mysqlTable(
  "contacts",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    email: varchar("email", { length: 320 }),
    /**
     * Organisationsnummer, canonical 10 digits without the hyphen (plan.md
     * §1.9). Nullable because most contacts are people at a company rather
     * than the company, and a lead captured from a form has never supplied
     * one. Validated and formatted through lib/se/identity — never here.
     */
    orgNr: varchar("org_nr", { length: 12 }),
    // --- Faktureringsadress (plan.md §5.2.3). A Swedish faktura must carry
    // the buyer's name *and address* (mervärdesskattelagen), and before O2
    // there was nowhere to put one. Structured rather than a single free-text
    // block so a later PEPPOL BIS export has the fields it needs (§10) —
    // that export is the reason this is five columns and not one.
    //
    // All nullable: a lead captured from a web form has no address, and must
    // still be a contact. The invoice flow is what requires them, and it says
    // so at issue time rather than at capture time.
    addressLine1: varchar("address_line1", { length: 200 }),
    addressLine2: varchar("address_line2", { length: 200 }),
    postalCode: varchar("postal_code", { length: 16 }),
    city: varchar("city", { length: 100 }),
    /** ISO 3166-1 alpha-2. Defaults to SE for a new contact in this edition. */
    country: char("country", { length: 2 }),
    notes: text("notes"),
    source: varchar("source", { length: 100 }),
    ownerUserId: char("owner_user_id", { length: 26 }),
    // First-touch attribution (§5.1): stamped once when the contact is
    // created and never overwritten, so "which site/campaign originally
    // produced this customer" survives every later interaction. Each
    // submission keeps its own last-touch set in lead_submissions.utm.
    firstSiteId: char("first_site_id", { length: 26 }),
    firstTouchUtm: json("first_touch_utm"),
    custom: json("custom").notNull().default({}),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("contacts_tenant_id_idx").on(table.tenantId),
    uniqueIndex("contacts_tenant_phone_idx").on(table.tenantId, table.phone),
    index("contacts_tenant_owner_idx").on(table.tenantId, table.ownerUserId),
    // B2B dedupe and lookup by org.nr. Deliberately not unique: two contacts
    // at the same company legitimately share one.
    index("contacts_tenant_org_nr_idx").on(table.tenantId, table.orgNr),
  ],
);

export const tags = mysqlTable(
  "tags",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    color: varchar("color", { length: 20 }),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("tags_tenant_id_idx").on(table.tenantId),
    uniqueIndex("tags_tenant_name_idx").on(table.tenantId, table.name),
  ],
);

export const contactTags = mysqlTable(
  "contact_tags",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    contactId: char("contact_id", { length: 26 }).notNull(),
    tagId: char("tag_id", { length: 26 }).notNull(),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("contact_tags_tenant_id_idx").on(table.tenantId),
    uniqueIndex("contact_tags_contact_tag_idx").on(table.contactId, table.tagId),
    index("contact_tags_tag_id_idx").on(table.tagId),
  ],
);

export const deals = mysqlTable(
  "deals",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    contactId: char("contact_id", { length: 26 }).notNull(),
    pipelineId: char("pipeline_id", { length: 26 }).notNull(),
    stageId: char("stage_id", { length: 26 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    // Minor units of `currency` — öre for SEK (plan.md §1.2).
    value: bigint("value", { mode: "number" }).notNull().default(0),
    currency: char("currency", { length: 3 }).notNull().default("SEK"),
    assignedUserId: char("assigned_user_id", { length: 26 }),
    // Kanban order within its stage — dragged deals get renumbered on drop.
    position: int("position").notNull().default(0),
    stageEnteredAt: datetime("stage_entered_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    closedAt: datetime("closed_at"),
    // Why the deal closed, in the rep's own words (PLAN.md §13 H8). Kept on
    // the deal rather than only in the activity trail so the board and any
    // later reporting can read it without walking the timeline.
    closeReason: varchar("close_reason", { length: 500 }),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("deals_tenant_id_idx").on(table.tenantId),
    index("deals_tenant_stage_idx").on(table.tenantId, table.stageId),
    index("deals_tenant_contact_idx").on(table.tenantId, table.contactId),
    index("deals_tenant_assigned_idx").on(table.tenantId, table.assignedUserId),
  ],
);

// Polymorphic timeline (§4): contact-level always; deal-level, form, and
// WhatsApp events attach via their own FK columns as those modules land.
export const activities = mysqlTable(
  "activities",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    contactId: char("contact_id", { length: 26 }).notNull(),
    dealId: char("deal_id", { length: 26 }),
    type: varchar("type", {
      length: 30,
      // "booking" added by docs/SPEC-BOOKING.md — an enum widening, additive
      // with nothing to backfill, and what puts "reservó una cita para el
      // jueves" on the unified timeline §5 promises.
      enum: [
        "note",
        "call",
        "stage_change",
        "form_submission",
        "quote_sent",
        "booking",
        "chat",
        "system",
      ],
    }).notNull(),
    payload: json("payload").notNull().default({}),
    userId: char("user_id", { length: 26 }),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("activities_tenant_contact_idx").on(table.tenantId, table.contactId),
    index("activities_tenant_deal_idx").on(table.tenantId, table.dealId),
  ],
);

// Follow-ups (PLAN.md §10 1J #3): the missing "who do I call today" surface —
// without this a deal can sit untouched for weeks with nothing surfacing it.
// Attaches to a contact always and optionally to a deal, same shape as
// activities above. `assignedUserId` is nullable (unassigned = anyone's) but
// `dueAt` is not — a task with no due date is just a note, which activities
// already cover.
export const tasks = mysqlTable(
  "tasks",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    contactId: char("contact_id", { length: 26 }).notNull(),
    dealId: char("deal_id", { length: 26 }),
    title: varchar("title", { length: 300 }).notNull(),
    dueAt: datetime("due_at").notNull(),
    assignedUserId: char("assigned_user_id", { length: 26 }),
    completedAt: datetime("completed_at"),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("tasks_tenant_contact_idx").on(table.tenantId, table.contactId),
    index("tasks_tenant_deal_idx").on(table.tenantId, table.dealId),
    // The dashboard "due today / overdue" list filters on tenant + open +
    // due date — this index is what keeps that query cheap as tasks pile up.
    index("tasks_tenant_due_idx").on(table.tenantId, table.completedAt, table.dueAt),
    index("tasks_tenant_assigned_idx").on(table.tenantId, table.assignedUserId),
  ],
);

// A saved contacts view: the filter/sort querystring a rep reaches for often,
// under a name. Tenant-owned and visible to everyone in the business — the
// pipeline is shared (§1.2 "in-tenant visibility"), so a view of it is too.
// `query` holds a canonical, re-serialized querystring of known filter keys
// only, never whatever the URL happened to contain.
export const contactViews = mysqlTable(
  "contact_views",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    /** Who saved it — an agent may delete their own; an admin may delete any. */
    createdByUserId: char("created_by_user_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    query: varchar("query", { length: 1000 }).notNull(),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("contact_views_tenant_id_idx").on(table.tenantId),
    uniqueIndex("contact_views_tenant_name_idx").on(table.tenantId, table.name),
  ],
);
