import { describe, expect, it } from "vitest";
import {
  allocateProRata,
  computeDocumentMoms,
  computeMoms,
  formatRateLabel,
  parseVatSummary,
  vatFor,
} from "./moms";

// The moms engine (plan.md §5.2.1). The tests that matter here are the
// property tests at the bottom: the rounding rule is only worth anything if
// netto + moms = brutto holds with zero öre drift on *every* document, not
// just the ones someone thought to write down.

// The rates a Swedish tenant is seeded with. Used as a menu to draw from, not
// as an assertion that these are the current statutory values — that is
// configuration (plan.md §4.11), and nothing in the engine branches on them.
const RATES = [2500, 1200, 600, 0];

/**
 * Negation that keeps zero positive. `-0` compares unequal to `0` under
 * `Object.is`, which is what `toBe` uses, so an expectation written as `-x`
 * fails against a genuine zero for reasons that have nothing to do with moms.
 * The engine never emits `-0`; this keeps the expectations honest too.
 */
const neg = (value: number): number => -value || 0;

describe("vatFor", () => {
  it("computes moms on a base at a rate in basis points", () => {
    expect(vatFor(100_00, 2500)).toBe(25_00);
    expect(vatFor(100_00, 1200)).toBe(12_00);
    expect(vatFor(100_00, 600)).toBe(6_00);
  });

  it("returns zero for a zero rate, which is not the same as no moms row", () => {
    expect(vatFor(999_99, 0)).toBe(0);
  });

  it("rounds half away from zero, not half up", () => {
    // 2 öre at 25 % is exactly 0,5 öre. Half-up would give 1; half away from
    // zero gives 1 here and -1 for the negation, which is the symmetry a
    // kreditfaktura needs.
    expect(vatFor(2, 2500)).toBe(1);
    expect(vatFor(-2, 2500)).toBe(-1);
    // 6 öre at 25 % is 1,5 öre.
    expect(vatFor(6, 2500)).toBe(2);
    expect(vatFor(-6, 2500)).toBe(-2);
  });

  it("negating a base negates the moms exactly, at every rate", () => {
    for (const rateBps of RATES) {
      for (let base = -5_000; base <= 5_000; base += 7) {
        expect(vatFor(-base, rateBps)).toBe(neg(vatFor(base, rateBps)));
      }
    }
  });

  it("refuses a non-integer amount rather than rounding it silently", () => {
    expect(() => vatFor(10.5, 2500)).toThrow(/integer amount/);
    expect(() => vatFor(1000, 25.5)).toThrow(/non-negative integer/);
  });

  it("refuses a product too large to be exact instead of losing precision", () => {
    expect(() => vatFor(Number.MAX_SAFE_INTEGER, 2500)).toThrow(/exact integer range/);
  });
});

describe("allocateProRata", () => {
  it("splits exactly, with no minor unit created or lost", () => {
    const parts = allocateProRata(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    // 33,33… each: the largest-remainder method hands the two spare öre to
    // the earliest lines, deterministically.
    expect(parts).toEqual([34, 33, 33]);
  });

  it("splits in proportion to the weights", () => {
    expect(allocateProRata(1000, [750, 250])).toEqual([750, 250]);
    expect(allocateProRata(300, [200, 100])).toEqual([200, 100]);
  });

  it("handles a negative amount (a credit note's rabatt) symmetrically", () => {
    expect(allocateProRata(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it("puts the whole amount on the first line when every weight is zero", () => {
    expect(allocateProRata(500, [0, 0])).toEqual([500, 0]);
  });

  it("is deterministic — the same input always splits the same way", () => {
    const weights = [17, 31, 5, 89, 2];
    const first = allocateProRata(1_234, weights);
    for (let i = 0; i < 20; i++) {
      expect(allocateProRata(1_234, weights)).toEqual(first);
    }
  });
});

describe("computeMoms", () => {
  it("groups lines into one summary row per rate, highest rate first", () => {
    const result = computeMoms([
      { base: 100_00, rateBps: 600 },
      { base: 200_00, rateBps: 2500 },
      { base: 50_00, rateBps: 600 },
    ]);
    expect(result.summary).toEqual([
      { rateBps: 2500, base: 200_00, vat: 50_00 },
      { rateBps: 600, base: 150_00, vat: 9_00 },
    ]);
  });

  it("totals the document from the rounded line amounts, never the other way round", () => {
    // Three lines whose moms each round up by half an öre. Computing moms on
    // the summed base (3 × 2 = 6 öre → 1,5 → 2) would give 2; summing the
    // rounded lines gives 3. The rule says 3, and the printed rows add up.
    const result = computeMoms([
      { base: 2, rateBps: 2500 },
      { base: 2, rateBps: 2500 },
      { base: 2, rateBps: 2500 },
    ]);
    expect(result.lines.map((line) => line.vat)).toEqual([1, 1, 1]);
    expect(result.vat).toBe(3);
    expect(vatFor(6, 2500)).toBe(2);
  });
});

describe("computeDocumentMoms", () => {
  it("computes a mixed-rate faktura — the 25 + 12 + 6 case from the plan", () => {
    const result = computeDocumentMoms([
      { lineTotal: 1_000_00, vatRateBps: 2500 },
      { lineTotal: 500_00, vatRateBps: 1200 },
      { lineTotal: 200_00, vatRateBps: 600 },
    ]);

    expect(result.subtotal).toBe(1_700_00);
    expect(result.net).toBe(1_700_00);
    expect(result.vatTotal).toBe(250_00 + 60_00 + 12_00);
    expect(result.gross).toBe(1_700_00 + 322_00);
    expect(result.summary).toEqual([
      { rateBps: 2500, base: 1_000_00, vat: 250_00 },
      { rateBps: 1200, base: 500_00, vat: 60_00 },
      { rateBps: 600, base: 200_00, vat: 12_00 },
    ]);
  });

  it("spreads a document rabatt across the lines pro rata, so the rate mix is unchanged", () => {
    const result = computeDocumentMoms(
      [
        { lineTotal: 750_00, vatRateBps: 2500 },
        { lineTotal: 250_00, vatRateBps: 600 },
      ],
      100_00,
    );

    // 75 % / 25 % of the rabatt, matching each line's share of the document.
    expect(result.lines.map((line) => line.discountShare)).toEqual([75_00, 25_00]);
    expect(result.lines.map((line) => line.base)).toEqual([675_00, 225_00]);
    expect(result.net).toBe(900_00);
    expect(result.vatTotal).toBe(vatFor(675_00, 2500) + vatFor(225_00, 600));
    expect(result.gross).toBe(result.net + result.vatTotal);
  });

  it("clamps a rabatt larger than the document instead of inverting it", () => {
    const result = computeDocumentMoms([{ lineTotal: 100_00, vatRateBps: 2500 }], 500_00);
    expect(result.discount).toBe(100_00);
    expect(result.net).toBe(0);
    expect(result.vatTotal).toBe(0);
    expect(result.gross).toBe(0);
  });

  it("ignores a rabatt pointing the wrong way for the document's sign", () => {
    // A negative rabatt on a positive faktura would be a surcharge in
    // disguise; a positive one on a credit note likewise.
    expect(computeDocumentMoms([{ lineTotal: 100_00, vatRateBps: 2500 }], -50_00).discount).toBe(0);
    expect(computeDocumentMoms([{ lineTotal: -100_00, vatRateBps: 2500 }], 50_00).discount).toBe(0);
  });

  it("negates exactly — the kreditfaktura round-trip, in pure arithmetic", () => {
    const lines = [
      { lineTotal: 1_337_77, vatRateBps: 2500 },
      { lineTotal: 499_99, vatRateBps: 1200 },
      { lineTotal: 83_33, vatRateBps: 600 },
      { lineTotal: 1_000_00, vatRateBps: 0 },
    ];
    const discount = 111_11;

    const faktura = computeDocumentMoms(lines, discount);
    const credit = computeDocumentMoms(
      lines.map((line) => ({ ...line, lineTotal: -line.lineTotal })),
      -discount,
    );

    expect(credit.net).toBe(neg(faktura.net));
    expect(credit.vatTotal).toBe(neg(faktura.vatTotal));
    expect(credit.gross).toBe(neg(faktura.gross));
    expect(credit.discount).toBe(neg(faktura.discount));
    expect(credit.lines.map((line) => line.vatAmount)).toEqual(
      faktura.lines.map((line) => neg(line.vatAmount)),
    );
    // The pair nets to nothing at all — which is what "the credit note
    // cancels the invoice" has to mean in the ledger.
    expect(faktura.gross + credit.gross).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Property tests. The rounding rule's whole claim is that it reconciles on
// every document, so these generate documents rather than enumerate them.
// ─────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG — a failing case must be reproducible from the seed. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

function randomDocument(random: () => number) {
  const lineCount = 1 + Math.floor(random() * 8);
  const lines = Array.from({ length: lineCount }, () => ({
    // Up to ~1 000 000 kr on a line, in öre, including awkward odd amounts.
    lineTotal: Math.floor(random() * 100_000_000) - 20_000_000,
    vatRateBps: RATES[Math.floor(random() * RATES.length)],
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const discount = Math.floor(random() * Math.abs(subtotal || 1)) * Math.sign(subtotal);
  return { lines, discount };
}

describe("moms reconciliation (property)", () => {
  it("never loses or invents an öre, across 5000 mixed-rate documents", () => {
    const random = makeRandom(0x5e_00_2a_11);

    for (let i = 0; i < 5_000; i++) {
      const { lines, discount } = randomDocument(random);
      const result = computeDocumentMoms(lines, discount);

      const lineBases = result.lines.reduce((sum, line) => sum + line.base, 0);
      const lineVat = result.lines.reduce((sum, line) => sum + line.vatAmount, 0);
      const summaryBase = result.summary.reduce((sum, row) => sum + row.base, 0);
      const summaryVat = result.summary.reduce((sum, row) => sum + row.vat, 0);
      const shares = result.lines.reduce((sum, line) => sum + line.discountShare, 0);

      // The four ways of asking "what is the netto" all agree.
      expect(lineBases).toBe(result.net);
      expect(summaryBase).toBe(result.net);
      expect(result.subtotal - result.discount).toBe(result.net);

      // …and so do the three ways of asking "what is the moms".
      expect(lineVat).toBe(result.vatTotal);
      expect(summaryVat).toBe(result.vatTotal);

      // The rabatt is fully allocated: not an öre held back, not an öre
      // conjured.
      expect(shares).toBe(result.discount);

      // The identity the whole invoice rests on.
      expect(result.net + result.vatTotal).toBe(result.gross);

      // Every amount is a whole öre — no float has leaked in anywhere.
      expect(Number.isSafeInteger(result.gross)).toBe(true);
      for (const line of result.lines) {
        expect(Number.isSafeInteger(line.vatAmount)).toBe(true);
        expect(Number.isSafeInteger(line.base)).toBe(true);
      }
    }
  });

  it("never rounds a line's moms by more than half an öre", () => {
    const random = makeRandom(0x11_22_33_44);

    for (let i = 0; i < 5_000; i++) {
      const base = Math.floor(random() * 200_000_000) - 100_000_000;
      const rateBps = RATES[Math.floor(random() * RATES.length)];
      const vat = vatFor(base, rateBps);
      // The exact value, as a scaled integer, so the comparison itself never
      // depends on a float.
      const exactScaled = base * rateBps;
      const roundedScaled = vat * 10_000;
      expect(Math.abs(exactScaled - roundedScaled) * 2).toBeLessThanOrEqual(10_000);
    }
  });

  it("gives a single-rate document the same moms as one computed on its total", () => {
    // Per-line rounding only diverges from whole-document rounding by the
    // accumulated half-öre; on a single line the two must agree exactly, and
    // that is the sanity check that the per-line rule isn't drifting.
    const random = makeRandom(0x0f_0f_0f_0f);
    for (let i = 0; i < 2_000; i++) {
      const total = Math.floor(random() * 10_000_000);
      const rateBps = RATES[Math.floor(random() * RATES.length)];
      const result = computeDocumentMoms([{ lineTotal: total, vatRateBps: rateBps }]);
      expect(result.vatTotal).toBe(vatFor(total, rateBps));
    }
  });

  it("negates exactly for any document (the credit-note property)", () => {
    const random = makeRandom(0xab_cd_ef_01);

    for (let i = 0; i < 2_000; i++) {
      const { lines, discount } = randomDocument(random);
      const original = computeDocumentMoms(lines, discount);
      const negated = computeDocumentMoms(
        lines.map((line) => ({ ...line, lineTotal: -line.lineTotal })),
        -discount,
      );

      expect(negated.net).toBe(neg(original.net));
      expect(negated.vatTotal).toBe(neg(original.vatTotal));
      expect(negated.gross).toBe(neg(original.gross));
      expect(original.gross + negated.gross).toBe(0);
    }
  });
});

describe("parseVatSummary", () => {
  it("reads back what the engine wrote", () => {
    const { summary } = computeDocumentMoms([
      { lineTotal: 1_000_00, vatRateBps: 2500 },
      { lineTotal: 500_00, vatRateBps: 1200 },
    ]);
    expect(parseVatSummary(JSON.parse(JSON.stringify(summary)))).toEqual(summary);
  });

  it("degrades to no summary rather than crashing a reprint of an old invoice", () => {
    expect(parseVatSummary(null)).toEqual([]);
    expect(parseVatSummary("nonsense")).toEqual([]);
    expect(parseVatSummary([{ rateBps: "25" }, null, 7])).toEqual([]);
    // A partially recognisable array keeps the rows it can read.
    expect(parseVatSummary([{ rateBps: 2500, base: 100, vat: 25 }, { junk: true }])).toEqual([
      { rateBps: 2500, base: 100, vat: 25 },
    ]);
  });
});

describe("formatRateLabel", () => {
  it("renders whole and fractional rates the Swedish way", () => {
    // \u00a0 — the label carries a non-breaking space before the sign, so
    // "25 %" never wraps across a line in a PDF totals column.
    expect(formatRateLabel(2500)).toBe("25\u00a0%");
    expect(formatRateLabel(600)).toBe("6\u00a0%");
    expect(formatRateLabel(0)).toBe("0\u00a0%");
    expect(formatRateLabel(1250)).toBe("12,50\u00a0%");
  });
});
