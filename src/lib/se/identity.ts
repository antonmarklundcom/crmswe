// Swedish identity, tax and payment reference numbers (plan.md §5.1.6).
//
// Pure functions only — no database, no framework, no app imports (enforced
// by boundary.test.ts). Everything here is a *format* rule, not a *tax* rule:
// nothing in this file changes when Skatteverket changes a rate, which is why
// it is allowed to be code at all. Rates and thresholds live in config rows
// with a validity date (plan.md §4.11).
//
// Sources for the formats implemented here:
//   - org.nr / personnummer check digit: "Luhn mod 10" over the first 9
//     digits of the 10-digit form (Skatteverket SKV 704, SKV 709).
//   - momsregistreringsnummer: "SE" + the 10-digit org.nr + "01".
//   - OCR with length control ("längdsiffra"): reference + length digit +
//     Luhn check digit, the Bankgirot standard for automatic reconciliation.

/** Digits only — callers may pass "556016-0680", "16556016 0680", "5560160680". */
function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Luhn ("modulus 10") checksum over a digit string, weights 2,1,2,1… applied
 * from the left so that the *last* digit of the string carries weight 2 when
 * the string excludes the check digit. Swedish identity numbers use exactly
 * this variant.
 */
export function luhnSum(digits: string): number {
  let sum = 0;
  // Weight the rightmost digit with 2 and alternate leftwards.
  for (let i = 0; i < digits.length; i++) {
    const digit = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (digit < 0 || digit > 9) return Number.NaN;
    const weighted = i % 2 === 0 ? digit * 2 : digit;
    sum += weighted > 9 ? weighted - 9 : weighted;
  }
  return sum;
}

/** The check digit that completes `digits` (which must exclude it). */
export function luhnCheckDigit(digits: string): number {
  const sum = luhnSum(digits);
  return Number.isNaN(sum) ? Number.NaN : (10 - (sum % 10)) % 10;
}

/** True when the last digit of `digits` is its own Luhn check digit. */
export function isLuhnValid(digits: string): boolean {
  if (digits.length < 2) return false;
  const body = digits.slice(0, -1);
  const check = digits.charCodeAt(digits.length - 1) - 48;
  return luhnCheckDigit(body) === check;
}

/**
 * Reduces any accepted written form of an org.nr or personnummer to its
 * canonical 10 digits, or null if it is not one.
 *
 * Accepts the 12-digit form (century prefix 16 for a company, 19/20 for a
 * person) because both turn up in imported data and on business cards. The
 * century is not part of the number's identity for our purposes — an enskild
 * firma's org.nr *is* the owner's personnummer (plan.md §1.9) and both are
 * stored and printed in the 10-digit form.
 */
export function toTenDigits(raw: string): string | null {
  const digits = digitsOf(raw);
  if (digits.length === 10) return digits;
  if (digits.length === 12) {
    const century = digits.slice(0, 2);
    // "16" is the company prefix; 18/19/20 are personnummer centuries. Any
    // other pair means this is not a 12-digit identity number.
    if (!["16", "18", "19", "20"].includes(century)) return null;
    return digits.slice(2);
  }
  return null;
}

/**
 * Organisationsnummer: 10 digits with a Luhn check digit.
 *
 * The third digit pair is ≥ 20 for a legal person (it is a group code, not a
 * month), which is what distinguishes a company's number from an enskild
 * firma's — but this predicate deliberately accepts both, because both are
 * legal values of a contact's or a tenant's org.nr field. Use
 * `isCompanyOrgNr` when the distinction matters.
 */
export function isValidOrgNr(raw: string): boolean {
  const digits = toTenDigits(raw);
  return digits !== null && isLuhnValid(digits);
}

/** True for a juridisk person's org.nr — the "month" pair is ≥ 20. */
export function isCompanyOrgNr(raw: string): boolean {
  const digits = toTenDigits(raw);
  if (digits === null || !isLuhnValid(digits)) return false;
  return Number(digits.slice(2, 4)) >= 20;
}

/** "5560160680" → "556016-0680". Returns null for anything invalid. */
export function formatOrgNr(raw: string): string | null {
  const digits = toTenDigits(raw);
  if (digits === null || !isLuhnValid(digits)) return null;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Personnummer (ÅÅMMDD-NNNN) and samordningsnummer (same, with 60 added to
 * the day). Validates the date as well as the check digit, which is what
 * separates it from `isValidOrgNr`.
 *
 * ⚠️ v1 stores no personnummer anywhere (plan.md §1.10). This exists because
 * an enskild firma's *org.nr* has this shape and we must not reject a sole
 * trader's number as malformed — not as an invitation to add a column.
 */
export function isValidPersonnummer(raw: string): boolean {
  const digits = toTenDigits(raw);
  if (digits === null || !isLuhnValid(digits)) return false;

  const month = Number(digits.slice(2, 4));
  const rawDay = Number(digits.slice(4, 6));
  const day = rawDay > 60 ? rawDay - 60 : rawDay;
  // The two-digit year cannot pick a century on its own; a leap year is the
  // only thing the century changes here, so validate against a leap year and
  // let 29 February pass rather than rejecting a real number.
  return isRealDate(2000, month, day);
}

/** "5560160680" → "SE556016068001", the momsregistreringsnummer (plan.md §1.9). */
export function momsRegNrFromOrgNr(raw: string): string | null {
  const digits = toTenDigits(raw);
  if (digits === null || !isLuhnValid(digits)) return null;
  return `SE${digits}01`;
}

/** Bankgiro: 7–8 digits, Luhn-checked, printed NNN-NNNN / NNNN-NNNN. */
export function isValidBankgiro(raw: string): boolean {
  const digits = digitsOf(raw);
  return digits.length >= 7 && digits.length <= 8 && isLuhnValid(digits);
}

export function formatBankgiro(raw: string): string | null {
  const digits = digitsOf(raw);
  if (!isValidBankgiro(raw)) return null;
  return `${digits.slice(0, digits.length - 4)}-${digits.slice(-4)}`;
}

/** Plusgiro: 2–8 digits, Luhn-checked, printed with the check digit split off. */
export function isValidPlusgiro(raw: string): boolean {
  const digits = digitsOf(raw);
  return digits.length >= 2 && digits.length <= 8 && isLuhnValid(digits);
}

export function formatPlusgiro(raw: string): string | null {
  const digits = digitsOf(raw);
  if (!isValidPlusgiro(raw)) return null;
  return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
}

/** Shortest OCR Bankgirot accepts with length control. */
const OCR_MIN_LENGTH = 4;
/** Longest OCR Bankgirot accepts. */
const OCR_MAX_LENGTH = 25;

/**
 * Builds an OCR reference with "hård kontroll" — length digit plus Luhn check
 * digit — from an invoice reference.
 *
 * Layout: `<reference><length digit><check digit>`, where the length digit is
 * the total length of the finished OCR modulo 10. That is the variant a bank
 * can validate on its own, which is the whole point: a payment quoting a
 * mistyped OCR is rejected at the bank rather than reconciled against the
 * wrong invoice.
 *
 * `reference` may carry non-digits (an invoice number like `FA-000123`); they
 * are stripped, so `FA-000123` and `123` produce the same OCR unless the
 * caller pads. Leading zeros are dropped for the same reason a bank drops
 * them. Throws when nothing usable is left, because an OCR that silently
 * became "" would print on an invoice.
 */
export function generateOcrNumber(reference: string | number): string {
  const digits = digitsOf(String(reference)).replace(/^0+/, "");
  if (digits.length === 0) {
    throw new Error("generateOcrNumber: reference contains no digits");
  }
  // Two digits are appended (length + check), so the reference itself is
  // capped to leave room.
  const body = digits.slice(-(OCR_MAX_LENGTH - 2));
  const padded = body.padStart(Math.max(OCR_MIN_LENGTH - 2, body.length), "0");
  const lengthDigit = (padded.length + 2) % 10;
  const withLength = `${padded}${lengthDigit}`;
  return `${withLength}${luhnCheckDigit(withLength)}`;
}

/**
 * Validates an OCR produced the way `generateOcrNumber` produces them: right
 * length, correct length digit, correct Luhn check digit.
 */
export function isValidOcrNumber(raw: string): boolean {
  const digits = digitsOf(raw);
  if (digits.length < OCR_MIN_LENGTH || digits.length > OCR_MAX_LENGTH) return false;
  if (!isLuhnValid(digits)) return false;
  const lengthDigit = Number(digits[digits.length - 2]);
  return lengthDigit === digits.length % 10;
}
