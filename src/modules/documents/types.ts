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
