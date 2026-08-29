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

/**
 * The same amount, but safe to draw with a standard PDF font.
 *
 * `sv-SE` formats a negative amount with U+2212 MINUS SIGN — typographically
 * correct, and what the HTML pages should keep. But react-pdf's built-in
 * Helvetica encodes WinAnsi, which has no U+2212, and a character it cannot
 * encode is dropped **silently**. On a kreditfaktura that is not a cosmetic
 * problem: every amount loses its minus and the credit note prints as an
 * identical copy of the invoice it was supposed to reverse.
 *
 * So amounts bound for a PDF get the ASCII hyphen-minus, which WinAnsi has.
 * Ugly, and correct, which is the right way round for an invoice.
 */
export function pdfMoney(amount: number, currency: string, locale: string): string {
  return toPdfSafe(formatMoney(amount, currency, locale));
}

/**
 * Replaces characters the standard PDF fonts cannot encode with ones they
 * can. Only the substitutions we actually emit — this is not a general
 * transliteration, and text outside WinAnsi that arrives from user data (a
 * product name in Greek, an emoji) still cannot be drawn by a built-in font.
 * Embedding a Unicode font is the real fix for that; see KNOWN-ISSUES.
 */
export function toPdfSafe(text: string): string {
  return text
    .replace(/−/g, "-") // minus sign → hyphen-minus
    .replace(/‑/g, "-"); // non-breaking hyphen → hyphen-minus
}

export function documentDate(value: Date, locale: string): string {
  return formatDate(value, locale, { dateStyle: "medium" });
}

/** Per-tenant sequential numbers are zero-padded to six digits — OFF-000123,
 * FA-000045 — across every document type (§8, §10 1Q). */
export const SEQUENCE_PAD = 6;

export function formatSequenceNumber(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(SEQUENCE_PAD, "0")}`;
}
