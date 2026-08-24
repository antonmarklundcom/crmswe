"use server";

import { revalidatePath } from "next/cache";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import { parseCsv } from "@/modules/crm/import";
import { importProducts, type ImportProductsReport } from "@/modules/quotes/products-csv";

// Product catalog import — admin-only, matching the create/deactivate gate
// on /products (§3.2: the catalog is tenant configuration). One step, not
// two: unlike contacts, the row shape is fixed (name, description,
// unit_price, currency, is_active), so there is no column to map.

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

export type ProductImportState = {
  error: string | null;
  report: ImportProductsReport | null;
};

export async function runProductImportAction(
  _prevState: ProductImportState,
  formData: FormData,
): Promise<ProductImportState> {
  const ctx = await requireTenantAdmin();

  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "").trim();

  let text = pasted;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CSV_BYTES) return { error: "tooLarge", report: null };
    text = await file.text();
  }

  if (!text) return { error: "empty", report: null };

  const { headers, rows } = parseCsv(text);
  if (headers.length === 0 || rows.length === 0) return { error: "empty", report: null };
  if (rows.length > MAX_ROWS) return { error: "tooManyRows", report: null };
  if (!headers.some((header) => header.trim().toLowerCase() === "name")) {
    return { error: "nameColumnMissing", report: null };
  }

  const report = await importProducts(ctx, rows);

  revalidatePath("/products");
  return { error: null, report };
}
