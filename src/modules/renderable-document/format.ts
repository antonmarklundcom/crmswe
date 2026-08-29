import { formatDate, formatMoney } from "@/lib/i18n/format";

// Money and dates as customer-facing documents print them
// (docs/VENDERCRM-PLAN.md §13 H9). Offerter and fakturor had a private copy
// of each of these, which is how the app came to have two money renderers
// that disagreed.

/**
 * The document renderers' money. Deliberately the same function the app
 * screens use — a faktura and the invoice list must never disagree about
 * what an amount says. `amount` is minor units (öre, plan.md §1.2).
 */
export function money(amount: number, currency: string, locale: string): string {
  return formatMoney(amount, currency, locale);
}

export function documentDate(value: Date, locale: string): string {
  return formatDate(value, locale, { dateStyle: "medium" });
}

/** Per-tenant sequential numbers are zero-padded to six digits — COT-000123,
 * NV-000045 — across every document type (§8, §10 1Q). */
export const SEQUENCE_PAD = 6;

export function formatSequenceNumber(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(SEQUENCE_PAD, "0")}`;
}
