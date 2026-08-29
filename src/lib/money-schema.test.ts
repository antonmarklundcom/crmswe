import { describe, expect, it } from "vitest";
import { moneyAmountSchema } from "./money-schema";

// The server-side half of the öre crossing (plan.md §1.2). If this ever
// accepted a typed amount as minor units, every price in the product would be
// a hundredfold wrong, so it gets its own test rather than only being
// exercised through the actions.

describe("moneyAmountSchema", () => {
  const sek = moneyAmountSchema("SEK");

  it("turns what a user types into öre", () => {
    expect(sek.parse("1495")).toBe(149500);
    expect(sek.parse("1 495,50")).toBe(149550);
    expect(sek.parse("0")).toBe(0);
    // A number posted rather than a string reads the same way.
    expect(sek.parse(1495)).toBe(149500);
  });

  it("rejects what is not a storable amount", () => {
    expect(sek.safeParse("").success).toBe(false);
    expect(sek.safeParse("abc").success).toBe(false);
    expect(sek.safeParse("1495,555").success).toBe(false);
    // Negative is opt-in.
    expect(sek.safeParse("-1").success).toBe(false);
  });

  it("honours a minimum, so a zero-kronor payment is not a payment", () => {
    const payment = moneyAmountSchema("SEK", { min: 1 });
    expect(payment.safeParse("0").success).toBe(false);
    expect(payment.parse("0,01")).toBe(1);
  });

  it("reports the failure on the field, not as a thrown error", () => {
    const result = sek.safeParse("nope");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("invalidAmount");
    }
  });
});
