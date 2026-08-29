// The momssatser a new tenant starts with (plan.md §1.4, §4.11).
//
// These are seed *configuration rows*, not constants the moms engine reads:
// nothing in the app may branch on 2500 the number. A tenant can change any of
// them, close one with a `validTo` and open a successor, and the UI shows the
// `source` next to the value so a user can see where it came from.
//
// ⚠️ The rates below are the well-known Swedish ones, but this file is not a
// legal source. `validFrom` in particular is a seed placeholder, not the
// statutory date the rate took effect — see KNOWN-ISSUES.md. Verify against
// Skatteverket before relying on any of it for a real invoice.

export type SeededVatRate = {
  rateBps: number;
  label: string;
  source: string;
  isDefault: boolean;
};

/**
 * Deliberately far in the past: a seeded rate must apply to every document a
 * new tenant can date, and the real statutory start dates are not something
 * this file is entitled to assert.
 */
export const SEEDED_VAT_RATE_VALID_FROM = new Date("2000-01-01T00:00:00.000Z");

const VERIFY = "Verifiera aktuell sats och giltighet hos Skatteverket.";

export const SEEDED_VAT_RATES: SeededVatRate[] = [
  {
    rateBps: 2500,
    label: "25 %",
    source: `Seedad standardsats för moms. ${VERIFY}`,
    isDefault: true,
  },
  {
    rateBps: 1200,
    label: "12 % (livsmedel, hotell, restaurang)",
    source: `Seedad reducerad sats. ${VERIFY}`,
    isDefault: false,
  },
  {
    rateBps: 600,
    label: "6 % (böcker, persontransport, kultur)",
    source: `Seedad reducerad sats. ${VERIFY}`,
    isDefault: false,
  },
  {
    rateBps: 0,
    label: "0 % (momsfritt/undantaget)",
    source: `Seedad nollsats för undantagen omsättning (vård, tandvård, utbildning m.fl.). ${VERIFY}`,
    isDefault: false,
  },
];
