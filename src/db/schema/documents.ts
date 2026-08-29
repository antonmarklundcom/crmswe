import {
  mysqlTable,
  char,
  varchar,
  int,
  bigint,
  datetime,
  index,
  json,
  uniqueIndex,
  text,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Fakturor och kreditfakturor (plan.md §1.5). This table began life as the
// Paraguayan "notas de venta" module and keeps its bones — draft→issued→void,
// per-tenant unbroken sequences, an immutability line at `issued`, a separate
// payment ledger — because those are exactly what a Swedish faktura needs.
//
// ⚠️ BOUNDARY RULE, load-bearing. Past `issued` a document is a record under
// bokföringslagen: its lines, totals, number and moms summary are frozen, it
// is kept for seven years, and there is no destructive delete path. A wrong
// issued faktura is corrected by a kreditfaktura that references it
// (`creditsDocumentId`), never by an edit. Anything that would mutate an
// issued row belongs in a new document, not here.
//
// The columns O2 fills in (moms per line, per-rate summary, OCR, delivery
// date) are declared here in O1 even though the engine that writes them comes
// later: schema is not retrofitted, and a faktura that is missing a legally
// required field is not a faktura.

export const documents = mysqlTable(
  "documents",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    /**
     * Varchar rather than a MySQL ENUM so a document kind can be added
     * without a migration (plan.md §1.6: kreditfaktura is a type, not a
     * status). The inherited `nota_venta` rows were migrated to `faktura`.
     */
    type: varchar("type", { length: 20, enum: ["faktura", "kreditfaktura"] })
      .notNull()
      .default("faktura"),
    // Per-tenant, per-type sequence — FA-000001 / KF-000001 (see
    // document_sequences). Each type has its own unbroken series.
    number: varchar("number", { length: 30 }).notNull(),
    contactId: char("contact_id", { length: 26 }).notNull(),
    dealId: char("deal_id", { length: 26 }),
    /** Set when the document was created by converting a quote. */
    quoteId: char("quote_id", { length: 26 }),
    /**
     * Lifecycle only. Payment state (paid / partially paid / unpaid) is
     * **derived** by summing document_payments, never stored here — a
     * denormalized paid-amount column is the classic source of drift
     * between the ledger and the header.
     *
     * `issued` is the immutability line: past it, lines, totals and number
     * are frozen (enforced in modules/documents/documents.ts). `void` is
     * the only escape, and only while no payments are recorded.
     */
    status: varchar("status", { length: 20, enum: ["draft", "issued", "void"] })
      .notNull()
      .default("draft"),
    currency: char("currency", { length: 3 }).notNull().default("SEK"),
    // Integer minor units — öre for SEK (plan.md §1.2). `subtotal` and
    // `total` are exklusive moms; `vatTotal` carries the moms on top.
    subtotal: bigint("subtotal", { mode: "number" }).notNull().default(0),
    discount: bigint("discount", { mode: "number" }).notNull().default(0),
    total: bigint("total", { mode: "number" }).notNull().default(0),
    /** Summed momsbelopp, minor units. Null until O2 computes it. */
    vatTotal: bigint("vat_total", { mode: "number" }),
    /**
     * Beskattningsunderlag och momsbelopp per momssats, frozen onto the row
     * when the document is issued — `[{ rateBps, base, vat }]`. Persisted
     * rather than recomputed so a PDF reprinted years later cannot be changed
     * by a later edit to `vat_rates` (plan.md §2, §5.2.3).
     */
    vatSummary: json("vat_summary"),
    /**
     * Who this faktura was made out to, frozen when it was issued:
     * `{ name, orgNr, addressLine1, addressLine2, postalCode, city, country,
     * email, phone }`.
     *
     * The same argument as `vatSummary`. A faktura is a record kept for seven
     * years, and the legally required buyer name and address are the ones
     * that were on it when it was sent — not the ones on the contact row
     * today. Without this, a customer moving office silently rewrites every
     * invoice they have ever received.
     */
    buyerSnapshot: json("buyer_snapshot"),
    /**
     * Who issued it, frozen the same way: `{ name, orgNr, momsRegNr,
     * bankgiro, plusgiro, fSkatt, invoiceFooter }`.
     *
     * A tenant that changes bankgiro must not retroactively change which
     * account every past invoice asked to be paid into — that is a
     * reconciliation problem, and for the F-skatt line, a fiscal claim about
     * a date in the past.
     */
    sellerSnapshot: json("seller_snapshot"),
    issuedAt: datetime("issued_at"),
    /** Förfallodatum: issue date + the tenant's betalvillkor. */
    dueAt: datetime("due_at"),
    /** Leverans-/utförandedatum, a required field on a Swedish faktura when
     * it differs from the invoice date. */
    deliveryDate: datetime("delivery_date"),
    /**
     * OCR reference for bank reconciliation (lib/se/identity), stamped when
     * the document is issued. Unique per tenant: two invoices sharing one OCR
     * would reconcile a payment against the wrong invoice.
     */
    ocrNumber: varchar("ocr_number", { length: 30 }),
    /**
     * For a kreditfaktura: the faktura it credits (plan.md §1.6). Always null
     * on a faktura. Not a foreign key, matching every other reference in this
     * schema, but the service layer refuses a kreditfaktura without it.
     */
    creditsDocumentId: char("credits_document_id", { length: 26 }),
    notes: text("notes"),
    // Unguessable token for the public read-only view /d/[token], same model
    // as the quote link (§8).
    publicToken: varchar("public_token", { length: 64 }).notNull(),
    pdfStorageKey: varchar("pdf_storage_key", { length: 500 }),
    voidedAt: datetime("voided_at"),
    voidReason: varchar("void_reason", { length: 500 }),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("documents_tenant_id_idx").on(table.tenantId),
    index("documents_tenant_contact_idx").on(table.tenantId, table.contactId),
    index("documents_tenant_status_idx").on(table.tenantId, table.status),
    uniqueIndex("documents_tenant_number_idx").on(table.tenantId, table.number),
    uniqueIndex("documents_public_token_idx").on(table.publicToken),
    uniqueIndex("documents_tenant_ocr_idx").on(table.tenantId, table.ocrNumber),
    index("documents_credits_document_idx").on(table.creditsDocumentId),
  ],
);

export const documentItems = mysqlTable(
  "document_items",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    documentId: char("document_id", { length: 26 }).notNull(),
    // Null for free-text lines — the catalog is optional, same as quotes.
    productId: char("product_id", { length: 26 }),
    description: varchar("description", { length: 500 }).notNull(),
    qty: int("qty").notNull().default(1),
    // Exklusive moms, minor units. A kreditfaktura's lines are negative.
    unitPrice: bigint("unit_price", { mode: "number" }).notNull().default(0),
    lineTotal: bigint("line_total", { mode: "number" }).notNull().default(0),
    /** Momssats in basis points; null until O2 activates the moms engine. */
    vatRateBps: int("vat_rate_bps"),
    /** Momsbelopp for this line, minor units — rounded per line, because the
     * document total is the sum of the lines and not the other way round
     * (plan.md §5.2.1). */
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
    index("document_items_tenant_id_idx").on(table.tenantId),
    index("document_items_document_id_idx").on(table.documentId),
  ],
);

/**
 * The payment ledger. Append-mostly: the sum of these rows *is* the amount
 * paid, which is why the header carries no paid-amount column. A correction
 * is a deletion by a user who can see the row, not a silent header edit.
 */
export const documentPayments = mysqlTable(
  "document_payments",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    documentId: char("document_id", { length: 26 }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull().default(0),
    currency: char("currency", { length: 3 }).notNull().default("SEK"),
    method: varchar("method", {
      length: 20,
      enum: ["transfer", "cash", "card", "check", "other"],
    })
      .notNull()
      .default("cash"),
    reference: varchar("reference", { length: 200 }),
    paidAt: datetime("paid_at").notNull(),
    recordedByUserId: char("recorded_by_user_id", { length: 26 }),
    notes: varchar("notes", { length: 500 }),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("document_payments_tenant_id_idx").on(table.tenantId),
    index("document_payments_document_id_idx").on(table.documentId),
  ],
);

/**
 * One counter row per (tenant, document type), incremented inside a
 * transaction — same discipline as quote_sequences (§8).
 *
 * A deliberately separate table rather than a `type` column bolted onto
 * quote_sequences: that table is live in production and numbers documents
 * customers have already received. Generalizing it in place would put
 * existing quote numbering at risk to save one table, which is a bad trade.
 */
export const documentSequences = mysqlTable(
  "document_sequences",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    docType: varchar("doc_type", { length: 20 }).notNull(),
    // Per-tenant prefix (plan.md §1.13): FA- for faktura, KF- for
    // kreditfaktura. A row is created per type on first use, so a tenant that
    // never credits an invoice never has a KF series.
    prefix: varchar("prefix", { length: 10 }).notNull().default("FA"),
    nextNumber: int("next_number").notNull().default(1),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("document_sequences_tenant_type_idx").on(table.tenantId, table.docType),
  ],
);
