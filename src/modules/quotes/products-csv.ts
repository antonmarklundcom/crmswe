import { z } from "zod";
import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { toCsv } from "@/modules/crm/export";
import { listProducts } from "./products";

// Product CSV import/export — VenderCRM-internal only. This is a bulk-edit
// tool for a tenant's own catalog, not a cross-project/shared format with
// the owner's other apps (ecom, negocio.com.py, …) — that's an explicit
// separate decision, deferred (PLAN.md doesn't cover it yet). The row shape
// mirrors `products` (PLAN.md §4 "quotes"): name, description, unit_price,
// currency, is_active.
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
    product.unitPrice,
    product.currency,
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
  // Guaraníes are whole units (§2.3) — no decimals to parse.
  unitPrice: z.coerce.number().int().min(0),
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

    const rawCurrency = (row.currency ?? "").trim() || "PYG";
    if (rawCurrency.length !== 3) {
      report.errors.push({ row: rowNumber, reason: "currencyInvalid" });
      continue;
    }

    const rawUnitPrice = (row.unit_price ?? "").trim() || "0";
    const parsed = rowSchema.safeParse({
      name,
      description: (row.description ?? "").trim() || undefined,
      unitPrice: rawUnitPrice,
      currency: rawCurrency,
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      report.errors.push({
        row: rowNumber,
        reason: field === "currency" ? "currencyInvalid" : "unitPriceInvalid",
      });
      continue;
    }

    const isActive = parseBoolean(row.is_active ?? "");
    if (isActive === undefined) {
      report.errors.push({ row: rowNumber, reason: "activeInvalid" });
      continue;
    }

    try {
      const current = byName.get(key);
      if (current) {
        await tenantDb(ctx)
          .update(products)
          .set({
            description: parsed.data.description ?? null,
            unitPrice: parsed.data.unitPrice,
            currency: parsed.data.currency,
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
            unitPrice: parsed.data.unitPrice,
            currency: parsed.data.currency,
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
