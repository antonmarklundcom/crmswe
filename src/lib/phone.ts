// Phone normalization to E.164 (PLAN.md §5, §10 1R #4). Pure and free of
// the db client so it can be imported — and unit-tested — without a
// configured environment, same as lib/money.ts.
//
// The default is Sweden: a leading "0" becomes "+46", so "070-123 45 67"
// normalizes to "+46701234567". Hardcoding one country silently corrupts any
// other country's local-format input, so `country` makes the
// trunk-prefix/dial-code assumption explicit and overridable per tenant;
// numbers already carrying a "+" or "00" prefix are unambiguous and pass
// through unaffected by it, so this only changes behavior for bare local
// numbers.

export const COUNTRY_CODES = ["SE", "NO", "DK", "FI", "US"] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

// Swedish edition (plan.md §1.11). A tenant can still override it in
// settings — the neighbours are here because a Swedish SMB's customer list
// has Norwegian and Danish numbers in it.
export const DEFAULT_COUNTRY: CountryCode = "SE";

const DIAL_CODE: Record<CountryCode, string> = {
  SE: "46",
  NO: "47",
  DK: "45",
  FI: "358",
  US: "1",
};

export function normalizePhone(raw: string, country: CountryCode = DEFAULT_COUNTRY): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;

  const dial = DIAL_CODE[country];
  // A leading trunk "0" (local dialing convention) is dropped in favor of
  // the country's dial code — true for SE, NO, FI alike. Denmark has no
  // trunk prefix, so a Danish number simply never starts with one.
  if (digits.startsWith("0")) return `+${dial}${digits.slice(1)}`;
  if (digits.startsWith(dial)) return `+${digits}`;
  return `+${dial}${digits}`;
}

/**
 * A wa.me deep link for a number we hold (plan-booking.md §6.2).
 *
 * wa.me wants bare digits — no `+`, no spaces — so the number is normalized
 * first and then stripped. Normalizing rather than trusting the stored string
 * matters for rows that predate normalization or arrived through an import:
 * a link built from "0981 123 456" opens a chat with nobody.
 *
 * Returns null when there is nothing dialable, so a caller renders plain text
 * instead of a link that would open WhatsApp on an empty conversation.
 */
export function waMeHref(
  raw: string | null | undefined,
  country: CountryCode = DEFAULT_COUNTRY,
  text?: string,
): string | null {
  if (!raw) return null;
  const digits = normalizePhone(raw, country).replace(/\D/g, "");
  // Shorter than a country code plus a subscriber number is not a phone
  // number, whatever it is.
  if (digits.length < 8) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}
