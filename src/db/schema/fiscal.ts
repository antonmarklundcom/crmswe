import {
  mysqlTable,
  char,
  varchar,
  int,
  boolean,
  datetime,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Momssatser as configuration, never as constants (plan.md §1.4, §4.11).
//
// A tax rate written into code is a bug waiting for a budget proposition: the
// Swedish reduced rates have moved before and the standard rate is not a law
// of nature either. So a rate is a row, with the date it starts applying, the
// date it stops, and a note saying where the value came from — and the UI can
// show a user why it thinks 25 % is 25 %.
//
// Tenant-scoped rather than platform-wide, like every other business table
// here: a tenant may be momsbefriad, may run a reduced-rate business, and must
// be able to correct its own configuration without touching anyone else's.
// Rows are seeded when the tenant is created.
export const vatRates = mysqlTable(
  "vat_rates",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    /**
     * Basis points — 2500 is 25 %. Integer basis points rather than a decimal
     * percentage so the moms math in O2 never touches a float.
     */
    rateBps: int("rate_bps").notNull(),
    /** What the picker shows: "25 %", "12 % (livsmedel, hotell, restaurang)". */
    label: varchar("label", { length: 120 }).notNull(),
    /**
     * When this rate starts applying. A rate is chosen by the document's date,
     * not by "now", so an invoice dated before a rate change still computes
     * with the rate that was in force.
     */
    validFrom: datetime("valid_from").notNull(),
    /** Null means "still in force". */
    validTo: datetime("valid_to"),
    /**
     * Where the number comes from, shown in the UI beside it. Free text on
     * purpose: a tenant correcting a rate should say why, and a seeded row
     * says which statute and that it needs verifying against Skatteverket.
     */
    source: varchar("source", { length: 500 }).notNull(),
    /** The rate a new line gets when nothing else names one. */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("vat_rates_tenant_id_idx").on(table.tenantId),
    // One row per rate per validity start: correcting a rate is an update or a
    // new validity period, never a second row saying something different about
    // the same day.
    uniqueIndex("vat_rates_tenant_rate_from_idx").on(
      table.tenantId,
      table.rateBps,
      table.validFrom,
    ),
  ],
);
