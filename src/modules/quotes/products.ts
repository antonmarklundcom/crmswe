import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Simple product catalog (PLAN.md §8) — optional, since quote lines can
// also be free text.

export type CreateProductInput = {
  name: string;
  description?: string;
  /** Exklusive moms, minor units — prices are always entered net (plan.md §5.2.2). */
  unitPrice: number;
  currency?: string;
  /**
   * Momssats in basis points. Omitted means "the tenant's default at the time
   * a line is priced" rather than "no moms" — resolved against `vat_rates`
   * when the product reaches a document, so a rate change does not silently
   * rewrite the catalog.
   */
  vatRateBps?: number | null;
};

export async function createProduct(ctx: TenantContext, input: CreateProductInput) {
  const id = newId();
  await tenantDb(ctx)
    .insert(products)
    .values({
      id,
      name: input.name,
      description: input.description,
      unitPrice: input.unitPrice,
      currency: input.currency ?? ctx.currency,
      vatRateBps: input.vatRateBps ?? null,
    });
  return getProduct(ctx, id);
}

export async function getProduct(ctx: TenantContext, id: string) {
  const [row] = await tenantDb(ctx).select(products, eq(products.id, id));
  return row ?? null;
}

export async function listProducts(ctx: TenantContext, includeInactive = false) {
  const rows = await tenantDb(ctx).select(products);
  return rows
    .filter((row) => includeInactive || row.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateProduct(
  ctx: TenantContext,
  id: string,
  input: Partial<CreateProductInput> & { isActive?: boolean },
) {
  await tenantDb(ctx).update(products).set(input).where(eq(products.id, id));
  return getProduct(ctx, id);
}
