// Shared money math for line-item documents (quotes, notas de venta).
// Pure and free of the db client so it can be imported — and unit-tested —
// without a configured environment.
//
// All amounts are integer minor units with a separate currency code (§2.3).
// PYG has 0 decimals, so for the default currency these are whole guaraníes.
// Nothing here ever produces a fraction: every operation is integer
// arithmetic, because a rounding error in a document a customer receives is
// not a rounding error, it's a wrong number.

export type LineInput = {
  productId?: string;
  description: string;
  qty: number;
  unitPrice: number;
};

export type ComputedLine = LineInput & { lineTotal: number };

export type ComputedTotals = {
  lines: ComputedLine[];
  subtotal: number;
  discount: number;
  total: number;
};

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
