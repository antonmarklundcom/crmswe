import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { documentItems, documentPayments, documents } from "@/db/schema";
import { newId } from "@/lib/ids";
import { type LineInput } from "@/lib/money";
import { computeDocumentMoms, type VatSummaryRow } from "@/lib/se/moms";
import { generateOcrNumber, momsRegNrFromOrgNr } from "@/lib/se/identity";
import { buildSystemTenantContext, type TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { writeAuditLog } from "@/modules/tenancy/audit";
import { resolveVatRateBps } from "@/modules/tenancy/vat-rates";
import { getTenant } from "@/modules/tenancy/tenants";
import { getContact } from "@/modules/crm/contacts";
import { createActivity } from "@/modules/crm/activities";
import { getQuote, listQuoteItems } from "@/modules/quotes/quotes";
import { nextDocumentNumber } from "./numbering";
import {
  balanceOf,
  grossOf,
  paymentStateOf,
  type BuyerSnapshot,
  type DocumentStatus,
  type DocumentType,
  type PaymentState,
  type SellerSnapshot,
} from "./types";

// Fakturor och kreditfakturor (plan.md §5.2).
//
// The invariant this module exists to enforce: **an issued document does not
// change.** An offert is an offer and may be edited freely; a faktura is a
// record under bokföringslagen, kept for seven years, and a customer holding
// the PDF must be able to trust that the copy in the system says the same
// thing. Everything that could mutate an issued document is refused here, in
// the service layer, rather than left to the UI to remember.
//
// Three rules follow from that, and every function below is arranged around
// them:
//
//   1. **Issuing freezes everything.** Lines, totals, the moms summary, the
//      number, the OCR, and the two party snapshots are all written or fixed
//      at `issueDocument` and never touched again.
//   2. **A correction is a new document.** A wrong faktura is answered by a
//      kreditfaktura that references it (`createCreditNote`), never by an
//      edit and never by voiding it. Voiding is for drafts only — a document
//      nobody has ever received (plan.md §5.2.4).
//   3. **Nothing is ever deleted.** There is no delete path for a document or
//      its lines anywhere in this module, and `documents.immutability.test.ts`
//      fails the build if one appears (bokföringslagen's seven years,
//      plan.md §5.2.5).
//
// Money on a document is stored **exklusive moms**: `subtotal` and `total`
// are beskattningsunderlag, `vatTotal` is the momsbelopp on top, and what the
// customer owes is `grossOf(document)`. Reports sum the net; the payment
// ledger reconciles against the gross.

export type DocumentRow = typeof documents.$inferSelect;
export type DocumentItemRow = typeof documentItems.$inferSelect;

/** A document line as it arrives from a form or another document. */
export type DocumentLineInput = LineInput & {
  /** Momssats in basis points. Omitted means "the tenant's default rate"
   * — resolved against `vat_rates`, never guessed in code (plan.md §4.11). */
  vatRateBps?: number | null;
};

export type CreateDocumentInput = {
  contactId: string;
  dealId?: string;
  type?: DocumentType;
  currency?: string;
  discount?: number;
  dueAt?: Date;
  deliveryDate?: Date;
  notes?: string;
  items: DocumentLineInput[];
};

function publicToken(): string {
  return randomBytes(24).toString("hex");
}

/** A line priced and taxed, ready to insert. */
type PricedLine = DocumentLineInput & {
  lineTotal: number;
  vatRateBps: number;
  vatAmount: number;
};

type PricedDocument = {
  lines: PricedLine[];
  subtotal: number;
  discount: number;
  /** Netto — beskattningsunderlag after the rabatt. Stored as `total`. */
  total: number;
  vatTotal: number;
  vatSummary: VatSummaryRow[];
};

/**
 * The one path from typed line items to stored amounts.
 *
 * Every rate is resolved against the tenant's `vat_rates` configuration for
 * the document's own date, so a rate that is not configured is refused rather
 * than written onto an invoice, and a document dated before a rate change
 * still prices with the rate that was in force then.
 *
 * Both writers (create and update-draft) and the credit-note flow go through
 * here, which is what makes the rounding rule a property of the module rather
 * than of whichever caller remembered it. `computeDocumentMoms` also owns the
 * rabatt clamp — its sign-aware version, not `computeLineTotals`', because a
 * kreditfaktura's lines and rabatt are both negative and the positive-only
 * clamp in `computeLineTotals` would turn a −100 kr rabatt into the whole
 * negative subtotal.
 */
async function priceLines(
  ctx: TenantContext,
  items: DocumentLineInput[],
  discount: number | undefined,
  on: Date,
): Promise<PricedDocument> {
  const rates = await Promise.all(
    items.map((item) => resolveVatRateBps(ctx, item.vatRateBps, on)),
  );

  const withTotals = items.map((item, index) => ({
    ...item,
    lineTotal: item.qty * item.unitPrice,
    vatRateBps: rates[index],
  }));

  const moms = computeDocumentMoms(
    withTotals.map((line) => ({ lineTotal: line.lineTotal, vatRateBps: line.vatRateBps })),
    discount ?? 0,
  );

  return {
    lines: withTotals.map((line, index) => ({
      ...line,
      vatAmount: moms.lines[index].vatAmount,
    })),
    subtotal: moms.subtotal,
    discount: moms.discount,
    total: moms.net,
    vatTotal: moms.vatTotal,
    vatSummary: moms.summary,
  };
}

export async function createDocument(ctx: TenantContext, input: CreateDocumentInput) {
  if (input.items.length === 0) {
    throw new Error("document_needs_items");
  }

  const type = input.type ?? "faktura";
  // A kreditfaktura is only ever created by `createCreditNote`, which knows
  // which faktura it credits. Letting one be built from loose lines would
  // produce a credit note referencing nothing, which is not a document an
  // accountant can do anything with.
  if (type === "kreditfaktura") {
    throw new Error("credit_note_requires_source");
  }

  const priced = await priceLines(ctx, input.items, input.discount, new Date());
  const id = newId();
  const number = await nextDocumentNumber(ctx, type);

  await tenantDb(ctx)
    .insert(documents)
    .values({
      id,
      type,
      number,
      contactId: input.contactId,
      dealId: input.dealId,
      status: "draft",
      currency: input.currency ?? ctx.currency,
      subtotal: priced.subtotal,
      discount: priced.discount,
      total: priced.total,
      vatTotal: priced.vatTotal,
      vatSummary: priced.vatSummary,
      dueAt: input.dueAt,
      deliveryDate: input.deliveryDate,
      notes: input.notes,
      publicToken: publicToken(),
    });

  await insertItems(ctx, id, priced.lines);
  return getDocument(ctx, id);
}

/**
 * Offert → faktura. Copies the lines **by value**, not by reference: the
 * offert stays independently editable afterwards, and a later change to it
 * can never rewrite a faktura a customer already holds.
 *
 * The offert's own momssats per line rides along, so the faktura charges what
 * the customer was quoted. Amounts are re-derived from those lines rather
 * than copied off the offert header — an offert stores no moms total of its
 * own (it is mutable, so its moms is always computed on read), and rebuilding
 * from the lines is what guarantees the faktura's rows add up to its total.
 */
export async function createDocumentFromQuote(
  ctx: TenantContext,
  quoteId: string,
  overrides: { dueAt?: Date; notes?: string; deliveryDate?: Date } = {},
) {
  const quote = await getQuote(ctx, quoteId);
  if (!quote) throw new Error(`quote_not_found:${quoteId}`);

  const items = await listQuoteItems(ctx, quote.id);
  if (items.length === 0) throw new Error("quote_has_no_items");

  const type: DocumentType = "faktura";
  const priced = await priceLines(
    ctx,
    items.map((item) => ({
      productId: item.productId ?? undefined,
      description: item.description,
      qty: item.qty,
      unitPrice: item.unitPrice,
      vatRateBps: item.vatRateBps,
    })),
    quote.discount,
    new Date(),
  );
  const id = newId();
  const number = await nextDocumentNumber(ctx, type);

  await tenantDb(ctx)
    .insert(documents)
    .values({
      id,
      type,
      number,
      contactId: quote.contactId,
      dealId: quote.dealId,
      quoteId: quote.id,
      status: "draft",
      currency: quote.currency,
      subtotal: priced.subtotal,
      discount: priced.discount,
      total: priced.total,
      vatTotal: priced.vatTotal,
      vatSummary: priced.vatSummary,
      dueAt: overrides.dueAt,
      deliveryDate: overrides.deliveryDate,
      notes: overrides.notes ?? quote.notes,
      publicToken: publicToken(),
    });

  await insertItems(ctx, id, priced.lines);

  return getDocument(ctx, id);
}

async function insertItems(ctx: TenantContext, documentId: string, lines: PricedLine[]) {
  let position = 0;
  for (const line of lines) {
    await tenantDb(ctx)
      .insert(documentItems)
      .values({
        id: newId(),
        documentId,
        productId: line.productId,
        description: line.description,
        qty: line.qty,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        vatRateBps: line.vatRateBps,
        vatAmount: line.vatAmount,
        position: position++,
      });
  }
}

export async function getDocument(ctx: TenantContext, id: string) {
  const [row] = await tenantDb(ctx).select(documents, eq(documents.id, id));
  return row ?? null;
}

export async function listDocuments(ctx: TenantContext) {
  const rows = await tenantDb(ctx).select(documents);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function listDocumentsForContact(ctx: TenantContext, contactId: string) {
  const rows = await tenantDb(ctx).select(documents, eq(documents.contactId, contactId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Used by the quote detail page to offer "convertir" only once per quote. */
export async function getDocumentByQuote(ctx: TenantContext, quoteId: string) {
  const [row] = await tenantDb(ctx).select(documents, eq(documents.quoteId, quoteId));
  return row ?? null;
}

export async function listDocumentItems(ctx: TenantContext, documentId: string) {
  const rows = await tenantDb(ctx).select(
    documentItems,
    eq(documentItems.documentId, documentId),
  );
  return rows.sort((a, b) => a.position - b.position);
}

/**
 * Replaces the lines of a **draft** document. Refused once issued — that is
 * the whole point of the status.
 */
export async function updateDraftDocument(
  ctx: TenantContext,
  id: string,
  input: {
    items: DocumentLineInput[];
    discount?: number;
    dueAt?: Date;
    deliveryDate?: Date;
    notes?: string;
  },
) {
  const document = await requireDraft(ctx, id);
  if (input.items.length === 0) {
    throw new Error("document_needs_items");
  }

  const priced = await priceLines(ctx, input.items, input.discount, new Date());

  // Replacing a *draft's* lines is the one delete in this module, and it is
  // reachable only past `requireDraft` — a draft has never been sent and is
  // not yet räkenskapsinformation. Nothing deletes an issued document's
  // lines, and the immutability test asserts that no such path exists.
  await tenantDb(ctx).delete(documentItems, eq(documentItems.documentId, document.id));
  await insertItems(ctx, document.id, priced.lines);

  await tenantDb(ctx)
    .update(documents)
    .set({
      subtotal: priced.subtotal,
      discount: priced.discount,
      total: priced.total,
      vatTotal: priced.vatTotal,
      vatSummary: priced.vatSummary,
      dueAt: input.dueAt,
      deliveryDate: input.deliveryDate,
      notes: input.notes,
    })
    .where(eq(documents.id, document.id));

  return getDocument(ctx, document.id);
}

/**
 * Issues the document — the one-way door. After this the number, the lines
 * and the totals are fixed, and a `document_issued` activity records it on
 * the contact timeline.
 */
export async function issueDocument(ctx: TenantContext, id: string) {
  const document = await requireDraft(ctx, id);

  const [contact, tenant] = await Promise.all([
    getContact(ctx, document.contactId),
    getTenant(ctx.tenantId),
  ]);
  if (!contact) throw new Error("contact_not_found");
  if (!tenant) throw new Error("tenant_not_found");

  const issuedAt = new Date();

  // Förfallodatum: whatever the draft set, else the tenant's betalvillkor
  // counted from today. A configured default, never a constant here — the
  // 30-day norm is a column on `tenants` for exactly that reason.
  const dueAt = document.dueAt ?? addDays(issuedAt, tenant.paymentTermsDays);

  // Leveransdatum is a required field on a Swedish faktura. When the draft
  // did not say otherwise, the service was delivered on the day it was
  // invoiced, which is the ordinary case for the businesses this is for.
  const deliveryDate = document.deliveryDate ?? issuedAt;

  // OCR is derived from the invoice number, so it is stable and reconcilable
  // by hand, and it carries a length digit plus a Luhn check digit so a
  // mistyped reference is rejected at the bank rather than matched to the
  // wrong invoice (lib/se/identity).
  const ocrNumber = document.ocrNumber ?? generateOcrNumber(document.number);

  await tenantDb(ctx)
    .update(documents)
    .set({
      status: "issued",
      issuedAt,
      dueAt,
      deliveryDate,
      ocrNumber,
      buyerSnapshot: buildBuyerSnapshot(contact),
      sellerSnapshot: buildSellerSnapshot(tenant),
    })
    .where(eq(documents.id, document.id));

  await createActivity(ctx, {
    contactId: document.contactId,
    dealId: document.dealId ?? undefined,
    type: "system",
    payload: {
      kind: "document_issued",
      documentId: document.id,
      number: document.number,
      total: document.total,
      vatTotal: document.vatTotal,
      gross: grossOf(document),
      currency: document.currency,
    },
    userId: ctx.userId,
  });

  return getDocument(ctx, document.id);
}

function addDays(from: Date, days: number): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
}

type ContactLike = Awaited<ReturnType<typeof getContact>>;
type TenantLike = Awaited<ReturnType<typeof getTenant>>;

/** The buyer block as it will print, captured at the moment of issue. */
function buildBuyerSnapshot(contact: NonNullable<ContactLike>): BuyerSnapshot {
  return {
    name: contact.name,
    orgNr: contact.orgNr ?? null,
    addressLine1: contact.addressLine1 ?? null,
    addressLine2: contact.addressLine2 ?? null,
    postalCode: contact.postalCode ?? null,
    city: contact.city ?? null,
    country: contact.country ?? null,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
  };
}

/**
 * The seller block, likewise. `momsRegNr` falls back to the derived
 * SE-form of the org.nr when the tenant has not entered one, because that
 * derivation is right for an ordinary Swedish company — but the stored value
 * wins, since group and foreign registrations exist and only the tenant knows.
 */
function buildSellerSnapshot(tenant: NonNullable<TenantLike>): SellerSnapshot {
  return {
    name: tenant.name,
    orgNr: tenant.orgNr ?? null,
    momsRegNr:
      tenant.momsRegNr ?? (tenant.orgNr ? momsRegNrFromOrgNr(tenant.orgNr) : null),
    bankgiro: tenant.bankgiro ?? null,
    plusgiro: tenant.plusgiro ?? null,
    fSkatt: tenant.fskatt === true,
    invoiceFooter: tenant.invoiceFooter ?? null,
  };
}

/**
 * Creates the kreditfaktura that reverses an issued faktura (plan.md §5.2.4).
 *
 * This is the *only* way to correct an issued invoice, and the shape of it is
 * dictated by that: a new document, with its own number from its own KF
 * series, whose lines are the original's negated, pointing back at what it
 * credits through `creditsDocumentId`. The original is not touched — after
 * the credit note exists, both documents stand, and the pair nets to zero.
 *
 * Amounts are re-derived from the negated lines rather than copied and
 * flipped, so the credit note's own rows add up to its own totals. That the
 * result is the exact negation of the original is a property of the moms
 * engine's away-from-zero rounding, not a coincidence — `moms.test.ts` proves
 * it for arbitrary documents, and the round-trip test here proves it end to
 * end through the database.
 *
 * Created as a draft: a kreditfaktura is itself a fiscal document, so it goes
 * through the same review-then-issue door as the faktura it credits.
 */
export async function createCreditNote(
  ctx: TenantContext,
  documentId: string,
  options: { notes?: string } = {},
) {
  const source = await getDocument(ctx, documentId);
  if (!source) throw new Error(`document_not_found:${documentId}`);
  if (source.type !== "faktura") throw new Error("only_faktura_can_be_credited");
  // Crediting a draft is meaningless — nobody has received it, so editing it
  // is both allowed and correct. Crediting a void one likewise: it never
  // entered the series as a live invoice.
  if (source.status !== "issued") throw new Error("only_issued_faktura_can_be_credited");

  const existing = await getCreditNoteFor(ctx, source.id);
  if (existing) throw new Error(`faktura_already_credited:${existing.number}`);

  const items = await listDocumentItems(ctx, source.id);
  if (items.length === 0) throw new Error("document_needs_items");

  // Negate the unit price rather than the quantity: "2 st à −450,00 kr" is
  // how a credit note reads to a human, and a negative quantity would fight
  // the qty ≥ 1 rule every other part of the app enforces.
  const priced = await priceLines(
    ctx,
    items.map((item) => ({
      productId: item.productId ?? undefined,
      description: item.description,
      qty: item.qty,
      unitPrice: -item.unitPrice,
      vatRateBps: item.vatRateBps,
    })),
    -source.discount,
    // The rate must be the one the original was priced at, so the credit
    // cancels it exactly even if the tenant's configuration has moved since.
    source.issuedAt ?? source.createdAt,
  );

  const id = newId();
  const number = await nextDocumentNumber(ctx, "kreditfaktura");

  await tenantDb(ctx)
    .insert(documents)
    .values({
      id,
      type: "kreditfaktura",
      number,
      contactId: source.contactId,
      dealId: source.dealId,
      quoteId: source.quoteId,
      status: "draft",
      currency: source.currency,
      subtotal: priced.subtotal,
      discount: priced.discount,
      total: priced.total,
      vatTotal: priced.vatTotal,
      vatSummary: priced.vatSummary,
      creditsDocumentId: source.id,
      // A credit note reverses the delivery the original invoiced, so it
      // carries the same leveransdatum rather than today's.
      deliveryDate: source.deliveryDate,
      notes: options.notes,
      publicToken: publicToken(),
    });

  await insertItems(ctx, id, priced.lines);
  return getDocument(ctx, id);
}

/** The kreditfaktura issued against a faktura, if one exists. */
export async function getCreditNoteFor(ctx: TenantContext, documentId: string) {
  const [row] = await tenantDb(ctx).select(
    documents,
    eq(documents.creditsDocumentId, documentId),
  );
  return row ?? null;
}

/**
 * Voids a **draft**. Abandoning a draft retires its number rather than
 * reusing it, so the series stays unbroken (plan.md §1.6).
 *
 * An issued faktura can no longer be voided (plan.md §5.2.4). That is the
 * substantive change O2 makes to this function, and it is the point of the
 * whole module: once a document has a number, a date and a customer holding
 * it, the only lawful correction is a kreditfaktura that references it —
 * `createCreditNote` below. A void would erase the invoice from the series
 * instead of recording that it was reversed, which is precisely what
 * bokföringslagen's audit trail exists to prevent.
 */
export async function voidDocument(ctx: TenantContext, id: string, reason: string) {
  const document = await getDocument(ctx, id);
  if (!document) throw new Error(`document_not_found:${id}`);
  if (document.status === "void") return document;
  if (document.status !== "draft") {
    throw new Error("issued_document_requires_credit_note");
  }

  await tenantDb(ctx)
    .update(documents)
    .set({ status: "void", voidedAt: new Date(), voidReason: reason.slice(0, 500) })
    .where(eq(documents.id, id));

  // Retiring a number out of the series cannot be undone, so it leaves a
  // trail (§3.2): who did it, under whose session if impersonated, and which
  // number is now permanently unused.
  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    impersonatorUserId: ctx.impersonatorUserId,
    action: "document.void",
    entity: "document",
    entityId: id,
    payload: { number: document.number, total: document.total, reason: reason.slice(0, 500) },
  });

  return getDocument(ctx, id);
}

export async function setDocumentPdfKey(ctx: TenantContext, id: string, key: string) {
  await tenantDb(ctx).update(documents).set({ pdfStorageKey: key }).where(eq(documents.id, id));
}

async function requireDraft(ctx: TenantContext, id: string): Promise<DocumentRow> {
  const document = await getDocument(ctx, id);
  if (!document) throw new Error(`document_not_found:${id}`);
  if (document.status !== "draft") {
    // The one-way door. Past `issued` this is räkenskapsinformation, and the
    // correction route is a kreditfaktura, not an edit (plan.md §5.2.4).
    throw new Error(`document_not_draft:${document.number}`);
  }
  return document;
}

// --- Payment ledger ------------------------------------------------------

export async function amountPaid(ctx: TenantContext, documentId: string): Promise<number> {
  const rows = await tenantDb(ctx).select(
    documentPayments,
    eq(documentPayments.documentId, documentId),
  );
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

export type DocumentTotals = {
  /** Netto — beskattningsunderlag after the rabatt, exklusive moms. */
  total: number;
  /** Momsbelopp. Null on a document issued before the moms engine existed. */
  vatTotal: number | null;
  /** `total + vatTotal` — the amount the customer is asked to pay. */
  gross: number;
  amountPaid: number;
  balance: number;
  state: PaymentState;
};

/**
 * The derived money view — what every UI should show, never raw columns.
 *
 * Balance and payment state are computed against the **gross**, because that
 * is the figure on the payment slip: a customer who pays a 1 000 kr + moms
 * invoice transfers 1 250 kr, and reconciling that against the 1 000 kr net
 * would report every fully paid invoice as overpaid and every partial payment
 * as complete.
 */
export async function getDocumentTotals(
  ctx: TenantContext,
  documentId: string,
): Promise<DocumentTotals | null> {
  const document = await getDocument(ctx, documentId);
  if (!document) return null;

  const paid = await amountPaid(ctx, documentId);
  const gross = grossOf(document);
  return {
    total: document.total,
    vatTotal: document.vatTotal,
    gross,
    amountPaid: paid,
    balance: balanceOf(gross, paid),
    state: paymentStateOf(document.status as DocumentStatus, gross, paid),
  };
}

export type RecordPaymentInput = {
  amount: number;
  method?: "transfer" | "cash" | "card" | "check" | "other";
  reference?: string;
  paidAt?: Date;
  notes?: string;
};

/**
 * Records money received. Only against an issued document: taking payment
 * for a draft means the draft was really an agreement, and letting the lines
 * still move underneath recorded money is exactly the drift this module
 * refuses.
 */
export async function recordPayment(
  ctx: TenantContext,
  documentId: string,
  input: RecordPaymentInput,
) {
  const document = await getDocument(ctx, documentId);
  if (!document) throw new Error(`document_not_found:${documentId}`);
  if (document.status !== "issued") {
    throw new Error("payment_requires_issued_document");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("payment_must_be_positive");
  }

  const id = newId();
  await tenantDb(ctx)
    .insert(documentPayments)
    .values({
      id,
      documentId,
      amount: Math.floor(input.amount),
      currency: document.currency,
      method: input.method ?? "cash",
      reference: input.reference,
      paidAt: input.paidAt ?? new Date(),
      recordedByUserId: ctx.userId,
      notes: input.notes,
    });

  return getDocumentTotals(ctx, documentId);
}

export async function listPayments(ctx: TenantContext, documentId: string) {
  const rows = await tenantDb(ctx).select(
    documentPayments,
    eq(documentPayments.documentId, documentId),
  );
  return rows.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
}

export async function deletePayment(ctx: TenantContext, documentId: string, paymentId: string) {
  // Read before deleting: the amount is the only thing worth auditing here,
  // and once the row is gone there is nothing left to record. A paymentId
  // that doesn't belong to this document (or this tenant) simply isn't found
  // and nothing is logged — the delete below is a no-op in that case too.
  const [payment] = await tenantDb(ctx).select(
    documentPayments,
    and(eq(documentPayments.id, paymentId), eq(documentPayments.documentId, documentId)),
  );

  await tenantDb(ctx).delete(
    documentPayments,
    and(eq(documentPayments.id, paymentId), eq(documentPayments.documentId, documentId)),
  );

  if (payment) {
    // Deleting a payment rewrites the ledger a document's balance is computed
    // from — destructive and admin-only, so it is audited like a void (§3.2).
    await writeAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      impersonatorUserId: ctx.impersonatorUserId,
      action: "document.payment_deleted",
      entity: "document",
      entityId: documentId,
      payload: { paymentId, amount: payment.amount, method: payment.method },
    });
  }

  return getDocumentTotals(ctx, documentId);
}

// --- Public token lookup -------------------------------------------------

/**
 * Resolves the public read-only link /d/[token]. Runs before any
 * TenantContext can exist — structurally the same unauthenticated lookup as
 * the quote token (§8), which is why this module carries the same raw-`db`
 * lint exemption. Everything after the tenant is known goes through
 * tenantDb.
 */
export async function getDocumentByPublicToken(token: string) {
  if (token.length < 32) return null;

  const [document] = await db.select().from(documents).where(eq(documents.publicToken, token));
  if (!document) return null;
  // A voided document's link stops resolving — the customer should not keep
  // seeing a cancelled sale as if it stood.
  if (document.status === "void") return null;

  const ctx = await buildSystemTenantContext(document.tenantId);
  if (!ctx) return null;

  const [items, paid] = await Promise.all([
    listDocumentItems(ctx, document.id),
    amountPaid(ctx, document.id),
  ]);

  const gross = grossOf(document);
  return {
    document,
    items,
    amountPaid: paid,
    gross,
    balance: balanceOf(gross, paid),
    state: paymentStateOf(document.status as DocumentStatus, gross, paid),
    ctx,
  };
}
