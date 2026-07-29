// Pure quote line math (PLAN.md §8), kept free of the db client so it can be
// imported — and unit-tested — without a configured environment.

export type QuoteLineInput = {
  productId?: string;
  description: string;
  qty: number;
  unitPrice: number;
};

/** Totals are derived here, never taken from the client. */
export function computeTotals(items: QuoteLineInput[], discount = 0) {
  const lines = items.map((item) => ({
    ...item,
    lineTotal: item.qty * item.unitPrice,
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  // A discount larger than the subtotal would produce a negative total,
  // which is never a real quote — clamp instead of trusting the input.
  const appliedDiscount = Math.min(Math.max(discount, 0), subtotal);
  return { lines, subtotal, discount: appliedDiscount, total: subtotal - appliedDiscount };
}
