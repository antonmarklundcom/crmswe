// Shared money math for line-item documents (offerter, fakturor).
// Pure and free of the db client so it can be imported — and unit-tested —
// without a configured environment.
//
// ⚠️ SEMANTICS (plan.md §1.2). All amounts are integer **minor units** with a
// separate currency code. For SEK that means **öre**: 1 495,00 kr is stored as
// `149500`. The inherited Paraguayan build stored whole guaraníes, because PYG
// has no minor unit, so every literal amount in old data and old tests is off
// by a factor of 100 from what the same integer means now.
//
// The consequence that matters: what a user *types* is a major-unit amount
// ("1 495,50"), and what the database holds is minor units. `parseMoneyInput`
// is the only sanctioned crossing of that line on the way in, and
// `formatMoney` / `formatMoneyInput` on the way out. A path that treats a
// typed number as minor units shows amounts 100× wrong — which on an invoice
// is not a rounding error, it's a wrong number.

/** Tenant default when nothing else names a currency (plan.md §1.3). */
export const DEFAULT_CURRENCY = "SEK";

const minorUnitDigitsCache = new Map<string, number>();

/**
 * How many minor-unit digits a currency has: 2 for SEK (öre), 0 for PYG.
 *
 * Read out of Intl rather than kept as a table here, so the answer comes from
 * CLDR instead of from something we would have to remember to update.
 */
export function currencyMinorUnitDigits(currency: string): number {
  const cached = minorUnitDigitsCache.get(currency);
  if (cached !== undefined) return cached;

  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    // An unknown code is a data problem, not a crash: fall back to 2, which
    // is what all but a handful of currencies use.
    digits = 2;
  }
  minorUnitDigitsCache.set(currency, digits);
  return digits;
}

/**
 * Minor units as an exact decimal string — "149500" → "1495.00". String math,
 * not division, because `x / 100` is a float and money is not.
 */
export function minorUnitsToDecimalString(minorUnits: number, digits: number): string {
  const negative = minorUnits < 0;
  const abs = Math.abs(minorUnits).toString();
  if (digits === 0) return `${negative ? "-" : ""}${abs}`;
  const padded = abs.padStart(digits + 1, "0");
  const whole = padded.slice(0, padded.length - digits);
  const fraction = padded.slice(padded.length - digits);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Every space a number can be typed or pasted with, including nbsp forms. */
const SPACE_PATTERN = /[\s   ]/g;

/**
 * Parses a major-unit amount as a person writes it into minor units.
 *
 * Accepted, because all of these turn up in a Swedish tenant's inputs and
 * pasted spreadsheet cells: `1495`, `1 495,50`, `1495.50`, `1.495` (dot as a
 * thousands separator), `-200`, `1 234 567,89`. Currency symbols and codes are
 * stripped, so `1 495 kr` parses too.
 *
 * The one genuinely ambiguous form is a single dot with exactly three digits
 * after it and no comma: `1.495`. Swedish never writes a decimal that way and
 * the inherited Paraguayan data writes thousands that way, so it is read as a
 * thousands separator — 1495, not 1.495. Two decimals after a dot (`1.49`) is
 * read as a decimal, which is the machine form our own CSV export writes.
 *
 * Returns null for anything that is not a number, or that carries more decimal
 * places than the currency has: `1495,555` in SEK is not a storable amount, and
 * silently rounding a price the user typed is worse than refusing it.
 */
export function parseMoneyInput(
  raw: string,
  currency: string = DEFAULT_CURRENCY,
): number | null {
  const digits = currencyMinorUnitDigits(currency);
  let text = raw.replace(SPACE_PATTERN, "");
  if (text.length === 0) return null;

  // Strip a currency symbol or code written alongside the amount.
  text = text.replace(/[A-Za-z¤€£$]/g, "");

  let negative = false;
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text) || text.length === 0) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let decimalAt = -1;
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever comes last is the decimal separator; the other groups thousands.
    decimalAt = Math.max(lastComma, lastDot);
  } else if (lastComma >= 0) {
    // Comma is the Swedish decimal separator, always.
    decimalAt = lastComma;
  } else if (lastDot >= 0) {
    const after = text.length - lastDot - 1;
    const onlyDot = text.indexOf(".") === lastDot;
    decimalAt = onlyDot && after !== 3 ? lastDot : -1;
  }

  const wholeText = decimalAt >= 0 ? text.slice(0, decimalAt) : text;
  const fractionPart = decimalAt >= 0 ? text.slice(decimalAt + 1) : "";
  // Anything left in the whole part must be a well-formed thousands grouping
  // — `1.234.567`, not `1,2,3`. Refusing a malformed group beats guessing at
  // which digits the person meant.
  if (!/^\d*$/.test(fractionPart)) return null;
  if (!/^\d+$/.test(wholeText) && !/^\d{1,3}([.,]\d{3})+$/.test(wholeText)) return null;
  const wholePart = wholeText.replace(/[.,]/g, "");
  if (wholePart.length === 0 && fractionPart.length === 0) return null;
  if (fractionPart.length > digits) return null;

  const combined = `${wholePart || "0"}${fractionPart.padEnd(digits, "0")}`;
  const value = Number(combined);
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

/**
 * Minor units back into the string a form field should hold — the inverse of
 * `parseMoneyInput`, so an edit form round-trips exactly. Comma decimal,
 * no thousands separator: what a Swedish user expects to see and what they can
 * edit without fighting a group separator.
 */
export function formatMoneyInput(
  minorUnits: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const digits = currencyMinorUnitDigits(currency);
  return minorUnitsToDecimalString(minorUnits, digits).replace(".", ",");
}

export type LineInput = {
  productId?: string;
  description: string;
  qty: number;
  /** Minor units (öre). */
  unitPrice: number;
};

export type ComputedLine = LineInput & { lineTotal: number };

export type ComputedTotals = {
  lines: ComputedLine[];
  subtotal: number;
  discount: number;
  total: number;
};

/**
 * A line as the builder holds it: raw strings, exactly what the inputs
 * contain and exactly what gets posted. The builder never converts to a
 * number on the way out — the server parses the strings itself and recomputes
 * every total from them.
 */
export type RawLineInput = {
  productId?: string;
  description: string;
  qty: string;
  unitPrice: string;
};

/**
 * Parses a quantity the way the server's zod schema will
 * (`z.coerce.number().int()`), and returns null for anything it would reject —
 * a decimal, a sign, a stray letter. Quantities are whole units; a fractional
 * one has no honest total to preview.
 */
export function parseQuantity(raw: string): number | null {
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * The builder's live preview. Mirrors the server's own reading of the posted
 * form — drop the blank rows, parse each amount the same way, apply the same
 * clamped discount math — and returns null when any value the server will
 * reject is present, so the display goes blank rather than showing a total
 * that the stored document won't match.
 */
export function previewTotals(
  rawLines: RawLineInput[],
  rawDiscount: string,
  currency: string = DEFAULT_CURRENCY,
): ComputedTotals | null {
  // A cleared discount field means "no discount", which is what the server
  // reads it as too — not a value that blanks the whole preview.
  const discount = parseMoneyInput(rawDiscount.trim() || "0", currency);
  if (discount === null || discount < 0) return null;

  const items: LineInput[] = [];
  for (const line of rawLines) {
    // Blank rows are "not filled in yet" — the server drops them too, so an
    // untouched extra row must not blank the preview.
    if (line.description.trim().length === 0) continue;
    const qty = parseQuantity(line.qty);
    const unitPrice = parseMoneyInput(line.unitPrice, currency);
    if (qty === null || qty < 1 || unitPrice === null || unitPrice < 0) return null;
    items.push({ productId: line.productId, description: line.description, qty, unitPrice });
  }

  return computeLineTotals(items, discount);
}

/** Totals are derived here, never taken from the client. */
export function computeLineTotals(items: LineInput[], discount = 0): ComputedTotals {
  const lines = items.map((item) => ({
    ...item,
    lineTotal: item.qty * item.unitPrice,
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  // A discount larger than the subtotal would produce a negative total,
  // which is never a real document — clamp instead of trusting the input.
  const appliedDiscount = Math.min(Math.max(discount, 0), subtotal);
  return { lines, subtotal, discount: appliedDiscount, total: subtotal - appliedDiscount };
}
