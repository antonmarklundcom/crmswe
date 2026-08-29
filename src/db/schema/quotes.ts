import {
  mysqlTable,
  char,
  varchar,
  int,
  bigint,
  boolean,
  datetime,
  index,
  uniqueIndex,
  text,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Offerter (PLAN.md §4 "quotes", §8) and the product catalog they price from.
// An offert is an offer that may still change, which is why it stays a
// separate table from `documents` — a faktura, once issued, may not.

export const products = mysqlTable(
  "products",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    // Integer minor units — öre for SEK (plan.md §1.2). Prices are entered
    // and stored *exklusive moms*.
    unitPrice: bigint("unit_price", { mode: "number" }).notNull().default(0),
    currency: char("currency", { length: 3 }).notNull().default("SEK"),
    /**
     * Momssats in basis points — 2500 for 25 %, 1200, 600, 0 (plan.md §1.4).
     * Nullable until O2 activates the moms engine: a null means "the tenant's
     * default rate at the time the line is priced", not "no moms". The rate
     * itself is never a constant in code — it comes from `vat_rates`.
     */
    vatRateBps: int("vat_rate_bps"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("products_tenant_id_idx").on(table.tenantId)],
);

export const quotes = mysqlTable(
  "quotes",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    contactId: char("contact_id", { length: 26 }).notNull(),
    dealId: char("deal_id", { length: 26 }),
    // Per-tenant sequence, e.g. OFF-000123 (§8, plan.md §1.13).
    number: varchar("number", { length: 30 }).notNull(),
    status: varchar("status", {
      length: 20,
      enum: ["draft", "sent", "accepted", "rejected", "expired"],
    })
      .notNull()
      .default("draft"),
    currency: char("currency", { length: 3 }).notNull().default("SEK"),
    subtotal: bigint("subtotal", { mode: "number" }).notNull().default(0),
    discount: bigint("discount", { mode: "number" }).notNull().default(0),
    total: bigint("total", { mode: "number" }).notNull().default(0),
    validUntil: datetime("valid_until"),
    notes: text("notes"),
    // Unguessable token for the public read-only view /q/[token] (§8).
    publicToken: varchar("public_token", { length: 64 }).notNull(),
    pdfStorageKey: varchar("pdf_storage_key", { length: 500 }),
    sentAt: datetime("sent_at"),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("quotes_tenant_id_idx").on(table.tenantId),
    index("quotes_tenant_contact_idx").on(table.tenantId, table.contactId),
    uniqueIndex("quotes_tenant_number_idx").on(table.tenantId, table.number),
    uniqueIndex("quotes_public_token_idx").on(table.publicToken),
  ],
);

export const quoteItems = mysqlTable(
  "quote_items",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    quoteId: char("quote_id", { length: 26 }).notNull(),
    // Null for free-text lines — the catalog is optional (§8).
    productId: char("product_id", { length: 26 }),
    description: varchar("description", { length: 500 }).notNull(),
    qty: int("qty").notNull().default(1),
    // Exklusive moms, minor units (plan.md §1.4).
    unitPrice: bigint("unit_price", { mode: "number" }).notNull().default(0),
    lineTotal: bigint("line_total", { mode: "number" }).notNull().default(0),
    /** Momssats in basis points; null until O2 activates the moms engine. */
    vatRateBps: int("vat_rate_bps"),
    /** Momsbelopp for this line, minor units. Computed and stored per line,
     * never derived from the document total (plan.md §1.4). */
    vatAmount: bigint("vat_amount", { mode: "number" }),
    position: int("position").notNull().default(0),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("quote_items_tenant_id_idx").on(table.tenantId),
    index("quote_items_quote_id_idx").on(table.quoteId),
  ],
);

// One counter row per tenant, incremented inside a transaction so two quotes
// created at the same moment can never take the same number (§8).
export const quoteSequences = mysqlTable(
  "quote_sequences",
  {
    tenantId: char("tenant_id", { length: 26 }).primaryKey(),
    nextNumber: int("next_number").notNull().default(1),
    // Per-tenant prefix (plan.md §1.13). Offert defaults to OFF-000123.
    prefix: varchar("prefix", { length: 10 }).notNull().default("OFF"),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
);
