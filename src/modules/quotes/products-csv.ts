import { z } from "zod";
import { eq } from "drizzle-orm";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { products } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { toCsv } from "@/modules/crm/export";
import { listProducts } from "./products";
import { listVatRates } from "@/modules/tenancy/vat-rates";

// ⚠️ `unit_price` is a **major-unit** amount in this file — "1495.00", not
// "149500" — on both the export and the import side (plan.md §1.2). A
// spreadsheet is edited by a person who thinks in kronor, and an export that
// wrote öre would come back through the importer as a hundredfold price the
// first time anyone round-tripped a file. Export writes the machine form
// (dot decimal, no grouping); import also accepts what a Swedish user types
// ("1 495,50").
//
// Product CSV import/export — internal only. This is a bulk-edit
// tool for a tenant's own catalog, not a cross-project/shared format with
// the owner's other apps (ecom, negocio.com.py, …) — that's an explicit
// separate decision, deferred (PLAN.md doesn't cover it yet). The row shape
// mirrors `products` (PLAN.md §4 "quotes"): name, description, unit_price,
// currency, vat_rate_bps, is_active.
//
// `vat_rate_bps` is basis points (2500 = 25 %), not a percentage, so a
// spreadsheet cannot turn "25" into "25 % of a percent" or a locale decimal
// comma into a column break. A blank cell means "the tenant's default rate",
// which is what an inherited catalog exported before O2 has.
//
// Modeled on the contacts importer (`modules/crm/import.ts`): same
// row-level report shape, same "never fail the whole file on one bad row"
// posture, same hand-rolled `parseCsv` (imported from there rather than
// duplicated).

export const PRODUCT_CSV_COLUMNS = [
  "name",
  "description",
  "unit_price",
  "currency",
  "vat_rate_bps",
  "is_active",
] as const;

/**
 * Every product in the catalog, including inactive ones — an export is a
 * backup/bulk-edit source of truth, not the filtered view `/products` shows.
 */
export async function exportProductsCsv(ctx: TenantContext): Promise<string> {
  const rows = await listProducts(ctx, true);
  const csvRows = rows.map((product) => [
    product.name,
    product.description ?? "",
    // Machine form, not the tenant's locale: a decimal comma inside an
    // unquoted CSV cell is a column break waiting to happen.
    formatMoneyInput(product.unitPrice, product.currency).replace(",", "."),
    product.currency,
    product.vatRateBps === null ? "" : String(product.vatRateBps),
    product.isActive ? "true" : "false",
  ]);
  return toCsv(PRODUCT_CSV_COLUMNS, csvRows);
}

export type ImportProductRowError = {
  /** 1-based row number as the user sees it in their spreadsheet (the
   * header is row 1), so "row 12 has no name" points at row 12. */
  row: number;
  reason:
    | "nameMissing"
    | "unitPriceInvalid"
    | "vatRateInvalid"
    | "currencyInvalid"
    | "activeInvalid"
    | "duplicateInFile"
    | "failed";
};

export type ImportProductsReport = {
  total: number;
  created: number;
  updated: number;
  errors: ImportProductRowError[];
};

const BOOLEAN_TRUE = new Set(["true", "1", "si", "sí", "yes", "activo", "active"]);
const BOOLEAN_FALSE = new Set(["false", "0", "no", "inactivo", "inactive"]);

function parseBoolean(raw: string): boolean | undefined {
  const value = raw.trim().toLowerCase();
  if (value === "") return true; // default: an imported row is active
  if (BOOLEAN_TRUE.has(value)) return true;
  if (BOOLEAN_FALSE.has(value)) return false;
  return undefined;
}

const rowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
});

/**
 * Imports parsed rows. Dedupe/match is by product name, case-insensitive,
 * both against the tenant's existing catalog and within the file itself — a
 * row that repeats a name updates the same product rather than creating a
 * second one, and a spreadsheet that lists a name twice reports the repeat
 * as an error rather than silently overwriting itself twice.
 */
export async function importProducts(
  ctx: TenantContext,
  rows: Record<string, string>[],
): Promise<ImportProductsReport> {
  const report: ImportProductsReport = {
    total: rows.length,
    created: 0,
    updated: 0,
    errors: [],
  };

  const existing = await listProducts(ctx, true);
  const byName = new Map(existing.map((product) => [product.name.toLowerCase(), { id: product.id }]));
  // The rates this tenant may price at. Read once for the whole file rather
  // than per row — an import is a bulk operation and the configuration does
  // not change underneath it.
  const configuredRates = new Set((await listVatRates(ctx)).map((rate) => rate.rateBps));
  const seen = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2; // +1 for zero-based, +1 for the header row

    const name = (row.name ?? "").trim();
    if (!name) {
      report.errors.push({ row: rowNumber, reason: "nameMissing" });
      continue;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      report.errors.push({ row: rowNumber, reason: "duplicateInFile" });
      continue;
    }
    seen.add(key);

    // A row that names no currency is priced in the tenant's own.
    const rawCurrency = (row.currency ?? "").trim() || ctx.currency;
    if (rawCurrency.length !== 3) {
      report.errors.push({ row: rowNumber, reason: "currencyInvalid" });
      continue;
    }

    const parsed = rowSchema.safeParse({
      name,
      description: (row.description ?? "").trim() || undefined,
      currency: rawCurrency,
    });
    if (!parsed.success) {
      report.errors.push({ row: rowNumber, reason: "currencyInvalid" });
      continue;
    }

    // Parsed against the row's own currency, since that is what decides how
    // many decimals the amount may carry.
    const rawUnitPrice = (row.unit_price ?? "").trim() || "0";
    const unitPrice = parseMoneyInput(rawUnitPrice, parsed.data.currency);
    if (unitPrice === null || unitPrice < 0) {
      report.errors.push({ row: rowNumber, reason: "unitPriceInvalid" });
      continue;
    }

    const isActive = parseBoolean(row.is_active ?? "");
    if (isActive === undefined) {
      report.errors.push({ row: rowNumber, reason: "activeInvalid" });
      continue;
    }

    // A blank cell means "the tenant's default rate", resolved when the
    // product reaches a document line. A value that is not one of the
    // tenant's configured rates is refused rather than written into the
    // catalog, where it would later reach an invoice (plan.md §4.11).
    const rawVatRate = (row.vat_rate_bps ?? "").trim();
    let vatRateBps: number | null = null;
    if (rawVatRate.length > 0) {
      const candidate = Number(rawVatRate);
      if (!Number.isInteger(candidate) || !configuredRates.has(candidate)) {
        report.errors.push({ row: rowNumber, reason: "vatRateInvalid" });
        continue;
      }
      vatRateBps = candidate;
    }

    try {
      const current = byName.get(key);
      if (current) {
        await tenantDb(ctx)
          .update(products)
          .set({
            description: parsed.data.description ?? null,
            unitPrice,
            currency: parsed.data.currency,
            vatRateBps,
            isActive,
          })
          .where(eq(products.id, current.id));
        report.updated += 1;
      } else {
        const id = newId();
        await tenantDb(ctx)
          .insert(products)
          .values({
            id,
            name,
            description: parsed.data.description,
            unitPrice,
            currency: parsed.data.currency,
            vatRateBps,
            isActive,
          });
        // A name introduced earlier in the same file must resolve against
        // its own new row, not create a second product on the next line.
        byName.set(key, { id });
        report.created += 1;
      }
    } catch {
      report.errors.push({ row: rowNumber, reason: "failed" });
    }
  }

  return report;
}
