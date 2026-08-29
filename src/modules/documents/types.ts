// Shared types for fakturor (PLAN.md §10 1Q, plan.md §1.5). Kept free of the
// db client so the pure helpers below can be unit-tested without a
// configured environment.
//
// `kreditfaktura` is a document type rather than a status (plan.md §1.6): an
// issued faktura is never edited, so a correction is a new document that
// references the original. O2 builds the flow; the type exists from O1 so the
// sequence, the schema and this union agree from the start.
export const DOCUMENT_TYPES = ["faktura", "kreditfaktura"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type DocumentStatus = "draft" | "issued" | "void";

export const PAYMENT_METHODS = ["transfer", "cash", "card", "check", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Payment state is derived, never stored (see the schema comment on
 * `documents.status`). Voided documents owe nothing regardless of what the
 * ledger says — though voiding is refused while payments exist, so in
 * practice a void document has an empty ledger.
 */
export type PaymentState = "unpaid" | "partial" | "paid" | "void";

export function paymentStateOf(
  status: DocumentStatus,
  total: number,
  amountPaid: number,
): PaymentState {
  if (status === "void") return "void";
  if (amountPaid <= 0) return "unpaid";
  // `>=` rather than `===`: an overpayment is still fully paid, and a
  // document that reads "partial" while the customer has paid more than the
  // total would be actively misleading to a rep chasing it.
  if (amountPaid >= total) return "paid";
  return "partial";
}

export function balanceOf(total: number, amountPaid: number): number {
  // Never negative — an overpayment leaves nothing owed, and a negative
  // balance rendered on a document reads as a debt owed *to* the customer,
  // which this document type does not represent.
  return Math.max(total - amountPaid, 0);
}

/**
 * What the customer actually owes: netto plus moms (plan.md §5.2.1).
 *
 * `documents.total` is **exklusive moms** — it is the beskattningsunderlag
 * after any rabatt, and it is the number reports sum, because revenue is
 * measured net of a tax you are only collecting on the state's behalf. The
 * amount on the payment slip is this one, and every balance, payment state
 * and "att betala" line must be computed against it.
 *
 * Documents issued before the moms engine existed carry a null `vatTotal`,
 * for which this returns the total unchanged — the behavior those rows have
 * always had.
 */
export function grossOf(document: { total: number; vatTotal: number | null }): number {
  return document.total + (document.vatTotal ?? 0);
}

/**
 * The buyer as printed on an issued faktura, frozen onto the row (plan.md
 * §5.2.3). Mervärdesskattelagen requires name and address; the rest is
 * carried because a reprint should not have to go looking for it.
 */
export type BuyerSnapshot = {
  name: string;
  orgNr: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
};

/** The seller as printed on an issued faktura, frozen the same way. */
export type SellerSnapshot = {
  name: string;
  orgNr: string | null;
  momsRegNr: string | null;
  bankgiro: string | null;
  plusgiro: string | null;
  /** "Godkänd för F-skatt" as it stood on the issue date. */
  fSkatt: boolean;
  invoiceFooter: string | null;
};

/**
 * Reads a persisted party snapshot back, or null if the column is empty or
 * holds a shape this version no longer recognises.
 *
 * Deliberately tolerant, for the same reason `parseVatSummary` is: the caller
 * is usually reprinting a document that may not be edited, so the honest
 * failure is "fall back to the live row", not a crashed PDF.
 */
function parseSnapshot<T extends object>(value: unknown, keys: (keyof T)[]): T | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  // One required key is enough to tell a real snapshot from an empty object;
  // every other field is legitimately null on a half-filled tenant.
  if (typeof record.name !== "string") return null;
  const result = {} as Record<string, unknown>;
  for (const key of keys) result[key as string] = record[key as string] ?? null;
  result.name = record.name;
  return result as T;
}

export function parseBuyerSnapshot(value: unknown): BuyerSnapshot | null {
  return parseSnapshot<BuyerSnapshot>(value, [
    "name",
    "orgNr",
    "addressLine1",
    "addressLine2",
    "postalCode",
    "city",
    "country",
    "email",
    "phone",
  ]);
}

export function parseSellerSnapshot(value: unknown): SellerSnapshot | null {
  const parsed = parseSnapshot<SellerSnapshot>(value, [
    "name",
    "orgNr",
    "momsRegNr",
    "bankgiro",
    "plusgiro",
    "fSkatt",
    "invoiceFooter",
  ]);
  if (!parsed) return null;
  // The F-skatt line is a claim about the seller's tax status on the invoice
  // date, so an unreadable value must read as "not approved" rather than
  // printing a statement nobody made.
  return { ...parsed, fSkatt: parsed.fSkatt === true };
}
