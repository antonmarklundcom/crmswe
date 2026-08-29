import { and, isNull, lte, or, gt } from "drizzle-orm";
import { vatRates } from "@/db/schema";
import type { TenantContext } from "./context";
import { tenantDb } from "./db";

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

// --- Reading a tenant's momssatser -----------------------------------------
//
// Everything below is the query side of the same concern: which rates this
// tenant may price a line at, and which one a line gets when nobody chose.
// Kept in this file rather than a service of its own so "what a momssats is
// for this product" has exactly one place to live.

export type VatRateRow = typeof vatRates.$inferSelect;

/**
 * The rates in force on a given date, highest first.
 *
 * The date is the **document's**, not `now`: an invoice dated before a rate
 * change must still compute with the rate that was in force when it was
 * issued, which is the entire reason `valid_from`/`valid_to` are columns
 * (plan.md §1.4). Callers pass the document date; a picker on a new document
 * passes today.
 */
export async function listVatRates(
  ctx: TenantContext,
  on: Date = new Date(),
): Promise<VatRateRow[]> {
  const rows = await tenantDb(ctx).select(
    vatRates,
    and(
      lte(vatRates.validFrom, on),
      // `valid_to` is exclusive: a rate that stopped applying at midnight is
      // not in force at midnight.
      or(isNull(vatRates.validTo), gt(vatRates.validTo, on)),
    ),
  );
  return rows.sort((a, b) => b.rateBps - a.rateBps);
}

/** Every rate row the tenant has, in force or not — the settings screen's view. */
export async function listAllVatRates(ctx: TenantContext): Promise<VatRateRow[]> {
  const rows = await tenantDb(ctx).select(vatRates);
  return rows.sort(
    (a, b) => b.rateBps - a.rateBps || b.validFrom.getTime() - a.validFrom.getTime(),
  );
}

/**
 * The momssats a line gets when nothing else names one.
 *
 * Falls back through: the tenant's flagged default → the highest rate in
 * force → 0. The last step is deliberate and is *not* "assume 25 %": a tenant
 * whose configuration says nothing must not have a rate invented for it in
 * code (plan.md §4.11). A zero shows up on the invoice as a 0 % line, which
 * is visible and wrong-looking, rather than as a plausible 25 % nobody chose.
 */
export async function defaultVatRateBps(
  ctx: TenantContext,
  on: Date = new Date(),
): Promise<number> {
  const rates = await listVatRates(ctx, on);
  const flagged = rates.find((rate) => rate.isDefault);
  if (flagged) return flagged.rateBps;
  return rates[0]?.rateBps ?? 0;
}

/**
 * Validates a requested momssats against the tenant's configuration and
 * returns the rate to store, or the default when none was requested.
 *
 * A rate that is not configured for this tenant on this date is refused
 * rather than trusted: the picker is populated from `vat_rates`, so a value
 * that isn't in it arrived from a tampered form, and silently accepting an
 * arbitrary rate on an invoice is a fiscal problem, not a validation nicety.
 */
export async function resolveVatRateBps(
  ctx: TenantContext,
  requested: number | null | undefined,
  on: Date = new Date(),
): Promise<number> {
  if (requested === null || requested === undefined) return defaultVatRateBps(ctx, on);

  const rates = await listVatRates(ctx, on);
  if (rates.some((rate) => rate.rateBps === requested)) return requested;
  throw new Error(`vat_rate_not_configured:${requested}`);
}

/**
 * Labels for a set of rates, for a document that prints its per-rate summary.
 * Falls back to the generic "25 %" rendering when a rate has since been
 * removed from the configuration — a reprint of an old invoice must not
 * depend on a row that still exists.
 */
export async function vatRateLabels(
  ctx: TenantContext,
  on: Date = new Date(),
): Promise<Map<number, string>> {
  const rates = await listVatRates(ctx, on);
  return new Map(rates.map((rate) => [rate.rateBps, rate.label]));
}
