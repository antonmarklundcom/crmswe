import { z } from "zod";
import { parseMoneyInput } from "./money";

// The one way a posted amount becomes minor units on the server (plan.md
// §1.2). Kept out of `lib/money.ts` so the client builders can import the
// parser without pulling zod into the bundle.
//
// Every money field in the app goes through this. A form field that reads
// `z.coerce.number().int()` instead is the 100× bug: it would store the number
// the user typed as öre, so 1 495 kr becomes 14,95 kr.

export type MoneyAmountOptions = {
  /** Minor units. Defaults to 0 — negative amounts are opt-in. */
  min?: number;
};

export function moneyAmountSchema(currency: string, { min = 0 }: MoneyAmountOptions = {}) {
  return z.union([z.string(), z.number()]).transform((raw, ctx) => {
    const value = parseMoneyInput(String(raw), currency);
    if (value === null || value < min) {
      ctx.addIssue({ code: "custom", message: "invalidAmount" });
      return z.NEVER;
    }
    return value;
  });
}
