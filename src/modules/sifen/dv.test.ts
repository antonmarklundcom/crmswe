import { describe, expect, it } from "vitest";
import { isValidRuc, modulo11CheckDigit, parseRuc } from "./dv";

// The pinned vector below comes from the SET's widely-mirrored reference
// implementation of `mr_digito_verificador`. It is the whole point of this
// file: módulo 11 has several plausible-looking variants (weights running
// left-to-right, remainder 1 mapping to 10, an unbounded weight cycle) and
// each of them produces digits SIFEN rejects. Do not change dv.ts without
// a vector proving the new behavior.

describe("modulo11CheckDigit", () => {
  it("matches the SET reference vector", () => {
    expect(modulo11CheckDigit("3535123")).toBe(3);
  });

  it("maps remainders 0 and 1 to a check digit of 0, never 11 or 10", () => {
    // "11" weights to 1*3 + 1*2 = 5 → remainder 5 → 6, a normal case, kept
    // as a control alongside the two special ones found by search below.
    expect(modulo11CheckDigit("11")).toBe(6);

    const digitsFor = (target: number) => {
      for (let n = 0; n < 100000; n++) {
        const candidate = String(n);
        let total = 0;
        let weight = 2;
        for (let i = candidate.length - 1; i >= 0; i--) {
          if (weight > 11) weight = 2;
          total += Number(candidate[i]) * weight;
          weight++;
        }
        if (total % 11 === target && total > 0) return candidate;
      }
      throw new Error(`no input found with remainder ${target}`);
    };

    expect(modulo11CheckDigit(digitsFor(0))).toBe(0);
    expect(modulo11CheckDigit(digitsFor(1))).toBe(0);
  });

  it("cycles the weight back to 2 once it passes the base", () => {
    // 12 digits forces one full wrap of the 2..11 cycle. If the cycle were
    // unbounded the two results would differ.
    const twelve = "123456789012";
    expect(modulo11CheckDigit(twelve)).toBe(modulo11CheckDigit(twelve, 11));
  });

  it("substitutes ASCII code points for non-digit characters", () => {
    // "A" is 65, so "A1" weights identically to "651".
    expect(modulo11CheckDigit("A1")).toBe(modulo11CheckDigit("651"));
  });
});

describe("parseRuc", () => {
  it("reads a RUC with its check digit", () => {
    expect(parseRuc("3535123-3")).toEqual({ base: "3535123", dv: 3 });
  });

  it("computes the check digit when none is supplied", () => {
    expect(parseRuc("3535123")).toEqual({ base: "3535123", dv: 3 });
  });

  it("rejects malformed input", () => {
    expect(parseRuc("")).toBeNull();
    expect(parseRuc("123456789")).toBeNull(); // 9 digits, over the 8-char base
    expect(parseRuc("3535123-33")).toBeNull();
  });
});

describe("isValidRuc", () => {
  it("accepts a correct check digit and rejects a wrong one", () => {
    expect(isValidRuc("3535123-3")).toBe(true);
    expect(isValidRuc("3535123-4")).toBe(false);
  });
});
