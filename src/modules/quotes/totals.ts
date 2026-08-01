// Quote line math (PLAN.md §8). The arithmetic itself now lives in
// lib/money, shared with notas de venta (§10 1Q) so both document types
// clamp and total identically — a discount that behaved one way on a quote
// and another on the document it converts into would be a real defect.
// This file stays as the quotes-facing name for it; the existing quote
// tests cover the behavior unchanged.

import { computeLineTotals, type LineInput } from "@/lib/money";

export type QuoteLineInput = LineInput;

/** Totals are derived here, never taken from the client. */
export const computeTotals = computeLineTotals;
