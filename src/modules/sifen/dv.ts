// Módulo 11 check digit, as used by the SET/DNIT for both the RUC and the
// 44-digit CDC (PLAN.md §9).
//
// SPEC PROVENANCE. The authoritative source is the SIFEN Manual Técnico.
// This implementation was written against the SET's widely-mirrored
// reference implementation (`mr_digito_verificador`, sfabianl/dv-modulo-11)
// and is pinned in dv.test.ts by that reference's own published vector
// (RUC base "3535123" → DV 3). Do not "simplify" the weighting below
// without a new vector to prove it: the cycle bound and the remainder rule
// are both places where a plausible-looking variant produces digits that
// SIFEN rejects.

/**
 * Weights cycle 2..`baseMax` from the **rightmost** character leftwards.
 * `baseMax` is 11 for the SET; it is a parameter only because the reference
 * implementation exposes it, not because anything here should pass another
 * value.
 */
const SET_BASE_MAX = 11;

/**
 * Non-digit characters are replaced by their ASCII code point before
 * weighting — a rule that exists because some RUCs are alphanumeric. It is
 * deliberately kept even though a CDC is all digits, so the RUC and CDC
 * paths share one audited implementation rather than diverging.
 */
function toDigitString(input: string): string {
  let out = "";
  for (const char of input.toUpperCase()) {
    const code = char.charCodeAt(0);
    out += code >= 48 && code <= 57 ? char : String(code);
  }
  return out;
}

export function modulo11CheckDigit(
  input: string,
  baseMax: number = SET_BASE_MAX,
): number {
  const digits = toDigitString(input);

  let total = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    if (weight > baseMax) weight = 2;
    total += Number(digits[i]) * weight;
    weight++;
  }

  const remainder = total % 11;
  // Remainders 0 and 1 both yield 0 — NOT 11 and 10. This is the single
  // most commonly mis-implemented line in the algorithm.
  return remainder > 1 ? 11 - remainder : 0;
}

/** `80012345-6` / `80012345` / `3535123-3` → { base, dv } or null if malformed. */
export function parseRuc(ruc: string): { base: string; dv: number } | null {
  const match = /^\s*([0-9A-Za-z]{1,8})(?:-([0-9]))?\s*$/.exec(ruc);
  if (!match) return null;
  const base = match[1].toUpperCase();
  return {
    base,
    dv: match[2] === undefined ? modulo11CheckDigit(base) : Number(match[2]),
  };
}

/** True when the RUC carries a check digit and that digit is the right one. */
export function isValidRuc(ruc: string): boolean {
  const parsed = parseRuc(ruc);
  if (!parsed) return false;
  return parsed.dv === modulo11CheckDigit(parsed.base);
}
