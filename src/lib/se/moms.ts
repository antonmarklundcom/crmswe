// Momsberäkning — the money math behind a Swedish faktura (plan.md §5.2.1).
//
// Pure functions only: no database, no framework, no app imports (enforced by
// boundary.test.ts). Rates are never constants here — a rate arrives as basis
// points from a `vat_rates` configuration row, and nothing in this file
// branches on a particular value (plan.md §4.11).
//
// ─────────────────────────────────────────────────────────────────────────
// THE ROUNDING RULE — there is exactly one, and this is it
// ─────────────────────────────────────────────────────────────────────────
//
//   1. Moms is computed and rounded **per line**, on that line's
//      beskattningsunderlag, to a whole öre.
//   2. A document's momsbelopp is the **sum of the already-rounded line
//      amounts**. It is never recomputed from the document total.
//   3. A per-rate summary row is likewise the sum of its lines' rounded
//      amounts, so `sum(summary.vat) === document.vatTotal` by construction.
//
// The rule matters because the two obvious alternatives disagree with it by
// an öre or two on a mixed-rate invoice, and an invoice whose printed rows do
// not add up to its printed total is one a customer's bookkeeper will bounce.
// Computing per line and summing upward is the only arrangement where the
// rows a human can check are themselves the source of the total.
//
// Rounding is **half away from zero**, not JavaScript's `Math.round` (which
// is half toward +∞). That difference is load-bearing for kreditfakturor:
// away-from-zero makes `vatFor(-base) === -vatFor(base)` an identity, so a
// credit note exactly cancels the invoice it credits, to the öre, at every
// rate. Half-up would leave a 1-öre residue on any line whose moms lands on a
// half öre — a permanent unreconcilable difference in the ledger.
//
// All arithmetic is integer. `base * rateBps` is an exact integer product and
// the division by 10 000 is done with `trunc` + remainder rather than `/`,
// so no float ever touches a moms amount.

/** Basis points per whole unit — 10 000 bps = 100 %. */
export const BPS_DIVISOR = 10_000;

/**
 * Collapses JavaScript's negative zero to plain zero.
 *
 * `-0` is contagious in this file — it falls out of `Math.trunc(-0.4)` and of
 * negating a zero total for a credit note — and while it adds and formats
 * like `0`, it is *not* `Object.is`-equal to it. That difference surfaces in
 * exactly the places money is checked most strictly: `toBe(0)` in a test, and
 * a persisted amount compared against a recomputed one. No amount leaves this
 * module carrying it.
 */
function zero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * Largest `base * rateBps` product that stays an exact integer. Beyond this
 * the product silently loses precision, so callers get a thrown error rather
 * than a quietly wrong momsbelopp on an invoice.
 */
const MAX_SAFE_PRODUCT = Number.MAX_SAFE_INTEGER;

/** A line as the moms engine sees it: a base amount and the rate on it. */
export type MomsLineInput = {
  /** Beskattningsunderlag for this line, minor units (öre), exkl. moms.
   * Negative on a kreditfaktura. */
  base: number;
  /** Momssats in basis points, from a `vat_rates` row. 2500 = 25 %. */
  rateBps: number;
};

export type MomsLine = MomsLineInput & {
  /** Momsbelopp for this line, minor units, rounded per the rule above. */
  vat: number;
};

/**
 * One row of the per-rate summary a Swedish faktura must print:
 * beskattningsunderlag and momsbelopp per momssats (mervärdesskattelagen).
 */
export type VatSummaryRow = {
  rateBps: number;
  /** Sum of the bases of this rate's lines. */
  base: number;
  /** Sum of this rate's lines' *rounded* moms amounts. */
  vat: number;
};

export type MomsTotals = {
  lines: MomsLine[];
  /** Highest rate first — the order a faktura prints them in. */
  summary: VatSummaryRow[];
  /** Netto: sum of all bases. */
  net: number;
  /** Total momsbelopp: sum of the rounded line amounts. */
  vat: number;
  /** Brutto: `net + vat`, exactly. */
  gross: number;
};

/**
 * Momsbelopp on one beskattningsunderlag, rounded half away from zero.
 *
 * Pure integer math: the product is exact, and the division by 10 000 is
 * carried out as truncation plus an explicit remainder comparison so the
 * rounding decision never depends on a float's last bit.
 */
export function vatFor(base: number, rateBps: number): number {
  if (!Number.isInteger(base)) {
    throw new Error(`vatFor: base must be an integer amount in minor units, got ${base}`);
  }
  if (!Number.isInteger(rateBps) || rateBps < 0) {
    throw new Error(`vatFor: rateBps must be a non-negative integer, got ${rateBps}`);
  }
  if (rateBps === 0 || base === 0) return 0;

  const product = base * rateBps;
  if (!Number.isSafeInteger(product)) {
    throw new Error(
      `vatFor: ${base} × ${rateBps} exceeds exact integer range (${MAX_SAFE_PRODUCT})`,
    );
  }

  const quotient = Math.trunc(product / BPS_DIVISOR);
  // Same sign as `product`, so the half-way comparison below is symmetric
  // about zero without a separate branch for negatives.
  const remainder = product - quotient * BPS_DIVISOR;
  const roundsAway = Math.abs(remainder) * 2 >= BPS_DIVISOR;
  if (!roundsAway) return zero(quotient);
  return zero(quotient + (product < 0 ? -1 : 1));
}

/**
 * Splits `amount` across `weights` so the parts sum **exactly** to `amount`.
 *
 * Used for a document-level rabatt on a mixed-rate faktura, which is the one
 * place the moms rule alone does not decide the answer: a 100 kr discount on
 * a document carrying both 25 % and 6 % lines reduces a different amount of
 * moms depending on which lines it is taken from. Spreading it pro rata by
 * line total is the neutral reading — every line is discounted by the same
 * proportion, so the rate mix of the document is unchanged by the discount.
 *
 * Weights are **signed**: a line's share is `amount × lineTotal / subtotal`,
 * which makes the discounted bases a uniform scaling of the originals and so
 * preserves each line's own sign. A correction document carrying both
 * positive and negative lines discounts correctly for that reason.
 *
 * The remainder öre that integer division leaves over are handed out by the
 * **largest-remainder method**: each exact share is first truncated *toward
 * zero*, then the lines whose share had the biggest fractional part get one
 * öre each, away from zero, until the total is exact. Ties go to the earlier
 * line, so the split is deterministic — the same document always discounts
 * the same way, which is what makes a reprint reproducible.
 *
 * Truncating toward zero rather than downward is what makes the split
 * symmetric under negation: `allocateProRata(-n, w)` is exactly
 * `allocateProRata(n, w)` negated, element for element. `Math.floor` would
 * push the spare öre onto a different line for a credit note than for the
 * invoice it credits, and the pair would no longer cancel line by line.
 */
export function allocateProRata(amount: number, weights: number[]): number[] {
  if (!Number.isInteger(amount)) {
    throw new Error(`allocateProRata: amount must be an integer, got ${amount}`);
  }
  if (weights.length === 0) return [];

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  // Nothing to spread across: give the whole amount to the first line rather
  // than dividing by zero. A document whose lines all total zero and yet
  // carries a discount is degenerate, but it must still balance.
  if (totalWeight === 0) {
    return weights.map((_, index) => (index === 0 ? amount : 0));
  }

  const exact = weights.map((weight) => (amount * weight) / totalWeight);
  const truncated = exact.map((value) => Math.trunc(value));
  let remaining = amount - truncated.reduce((sum, value) => sum + value, 0);

  // Largest fractional part first; ties to the earlier line.
  const order = exact
    .map((value, index) => ({ index, fraction: Math.abs(value - Math.trunc(value)) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const result = [...truncated];
  for (const { index } of order) {
    if (remaining === 0) break;
    const step = remaining > 0 ? 1 : -1;
    result[index] += step;
    remaining -= step;
  }
  return result.map(zero);
}

/**
 * The moms engine's core: rounded moms per line, plus the per-rate summary
 * and the reconciling net/vat/gross triple.
 *
 * Guaranteed by construction, and asserted in moms.test.ts:
 *   `net + vat === gross`
 *   `sum(lines.vat) === vat === sum(summary.vat)`
 *   `sum(lines.base) === net === sum(summary.base)`
 */
export function computeMoms(inputs: MomsLineInput[]): MomsTotals {
  const lines: MomsLine[] = inputs.map((input) => ({
    ...input,
    vat: vatFor(input.base, input.rateBps),
  }));

  // Insertion-ordered accumulation, then sorted once — so two lines at the
  // same rate always land in one summary row regardless of where they sit in
  // the document.
  const byRate = new Map<number, VatSummaryRow>();
  for (const line of lines) {
    const row = byRate.get(line.rateBps) ?? { rateBps: line.rateBps, base: 0, vat: 0 };
    row.base += line.base;
    row.vat += line.vat;
    byRate.set(line.rateBps, row);
  }
  const summary = [...byRate.values()].sort((a, b) => b.rateBps - a.rateBps);

  const net = lines.reduce((sum, line) => sum + line.base, 0);
  const vat = lines.reduce((sum, line) => sum + line.vat, 0);
  return { lines, summary, net, vat, gross: net + vat };
}

/** A document line as it reaches the moms engine, before any discount. */
export type MomsDocumentLine = {
  /** qty × unitPrice, minor units, exkl. moms. */
  lineTotal: number;
  /** Momssats in basis points, resolved from `vat_rates` by the caller. */
  vatRateBps: number;
};

export type MomsDocumentLineResult = MomsDocumentLine & {
  /** This line's share of the document-level rabatt, minor units. */
  discountShare: number;
  /** `lineTotal - discountShare` — what moms is actually charged on. */
  base: number;
  /** Momsbelopp for this line. */
  vatAmount: number;
};

export type MomsDocumentTotals = {
  lines: MomsDocumentLineResult[];
  /** Sum of the undiscounted line totals, exkl. moms. */
  subtotal: number;
  /** The rabatt actually applied, after clamping. */
  discount: number;
  /** `subtotal - discount` — the document's netto and the sum of the bases. */
  net: number;
  /** Total momsbelopp, the sum of the rounded line amounts. */
  vatTotal: number;
  /** `net + vatTotal` — what the customer owes. */
  gross: number;
  summary: VatSummaryRow[];
};

/**
 * Whole-document moms: allocate the rabatt across the lines, compute moms on
 * each discounted base, and roll the results up.
 *
 * A negative document (a kreditfaktura, whose lines and discount are the
 * negation of the faktura it credits) passes through unchanged in shape and
 * comes out exactly negated in every field — that is the round-trip property
 * the credit-note flow depends on, and it is why the discount clamp below is
 * written in terms of magnitude rather than `Math.max(…, 0)`.
 */
export function computeDocumentMoms(
  lines: MomsDocumentLine[],
  discount = 0,
): MomsDocumentTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  // A rabatt bigger than the document is not a document — clamp it to the
  // subtotal rather than letting a typo invert the invoice. On a credit note
  // both numbers are negative, so the clamp compares magnitudes and keeps the
  // subtotal's sign.
  const clamped =
    Math.sign(discount) === Math.sign(subtotal) || discount === 0
      ? Math.abs(discount) > Math.abs(subtotal)
        ? subtotal
        : discount
      : 0;

  const shares = allocateProRata(
    clamped,
    lines.map((line) => line.lineTotal),
  );

  const resolved: MomsDocumentLineResult[] = lines.map((line, index) => {
    const discountShare = shares[index] ?? 0;
    const base = line.lineTotal - discountShare;
    return { ...line, discountShare, base, vatAmount: vatFor(base, line.vatRateBps) };
  });

  const { summary, net, vat, gross } = computeMoms(
    resolved.map((line) => ({ base: line.base, rateBps: line.vatRateBps })),
  );

  return {
    lines: resolved,
    subtotal,
    discount: clamped,
    net,
    vatTotal: vat,
    gross,
    summary,
  };
}

/**
 * Reads a persisted `vat_summary` JSON column back into typed rows.
 *
 * Defensive on purpose: this value was written by an earlier version of the
 * app onto a row that may not be edited again, so a shape that no longer
 * matches must degrade to "no summary" rather than crash the reprint of a
 * seven-year-old invoice.
 */
export function parseVatSummary(value: unknown): VatSummaryRow[] {
  if (!Array.isArray(value)) return [];
  const rows: VatSummaryRow[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { rateBps, base, vat } = entry as Record<string, unknown>;
    if (
      typeof rateBps === "number" &&
      typeof base === "number" &&
      typeof vat === "number" &&
      Number.isFinite(rateBps) &&
      Number.isFinite(base) &&
      Number.isFinite(vat)
    ) {
      rows.push({ rateBps, base, vat });
    }
  }
  return rows.sort((a, b) => b.rateBps - a.rateBps);
}

/** "2500" → "25 %" — the label a summary row prints when no configured
 * `vat_rates` label is available (a reprint of a rate since deleted). */
export function formatRateLabel(rateBps: number): string {
  const whole = Math.trunc(rateBps / 100);
  const fraction = Math.abs(rateBps % 100);
  const number = fraction === 0 ? String(whole) : `${whole},${String(fraction).padStart(2, "0")}`;
  // Non-breaking space before the sign, per Swedish typographic convention.
  return `${number} %`;
}
