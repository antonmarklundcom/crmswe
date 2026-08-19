import { formatDate, formatNumber } from "@/lib/i18n/format";

// Money and dates as customer-facing documents print them (PLAN.md §13 H9).
// Quotes and notas de venta had a private copy of each of these; SIFEN
// (§9) will need the same again, which is exactly why they live here now.

/** PYG has no decimal places (§2.3), so amounts are whole guaraníes and the
 * thousands separator is the only formatting needed. */
export function money(amount: number, currency: string, locale: string): string {
  const formatted = formatNumber(amount, locale, {
    minimumFractionDigits: currency === "PYG" ? 0 : 2,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  });
  return `${currency} ${formatted}`;
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
