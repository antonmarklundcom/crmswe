import {
  mysqlTable,
  char,
  varchar,
  boolean,
  datetime,
  index,
  text,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// The agenda (PLAN.md §10 — the calendar module). A scheduled thing with a
// start and an end: a visit to a site, a call at four, a signing. Tenant-owned
// and shared with the whole business, like the pipeline it hangs off.
//
// Times are stored UTC (§2.3) and rendered in the tenant's own timezone. Every
// grid boundary in modules/calendar is derived from `tenants.timezone`, never
// from the server's clock — a Hostinger box in another zone must not shift
// which day a nine-o'clock visit falls on.
export const calendarEvents = mysqlTable(
  "calendar_events",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    startsAt: datetime("starts_at").notNull(),
    endsAt: datetime("ends_at").notNull(),
    /** Spans whole local days; `starts_at`/`ends_at` still hold the real
     * instants (local midnight to the next local midnight) so one range
     * query finds timed and all-day events alike. */
    allDay: boolean("all_day").notNull().default(false),
    location: varchar("location", { length: 300 }),
    /** What the appointment is about, when it is about something in the CRM. */
    contactId: char("contact_id", { length: 26 }),
    dealId: char("deal_id", { length: 26 }),
    /** Whose agenda it sits on. Null means the business's, not nobody's. */
    assignedUserId: char("assigned_user_id", { length: 26 }),
    createdByUserId: char("created_by_user_id", { length: 26 }).notNull(),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    // Every calendar read is "this business, this window", which is what
    // this index answers; the others serve the per-rep filter and the
    // contact record's own agenda tab.
    index("calendar_events_tenant_starts_idx").on(table.tenantId, table.startsAt),
    index("calendar_events_tenant_assigned_idx").on(table.tenantId, table.assignedUserId),
    index("calendar_events_tenant_contact_idx").on(table.tenantId, table.contactId),
  ],
);
