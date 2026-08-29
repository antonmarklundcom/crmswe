"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import { moneyAmountSchema } from "@/lib/money-schema";
import { createProduct, updateProduct } from "@/modules/quotes/products";
import { resolveVatRateBps } from "@/modules/tenancy/vat-rates";

// The catalog is tenant configuration (§3.2): agents sell from it — and so
// still read it on /products, /quotes and /documents — but only an admin
// adds a product or takes one out of circulation.

// useActionState-shaped (PLAN.md §10 1R #6): a bad price or a missing name
// comes back as state rendered next to the input, not Next's error page.
export type ProductField = "name" | "unitPrice" | "vatRateBps";

export type ProductFormState = {
  error: string | null;
  field: ProductField | null;
  values: Record<string, string>;
};

const PRODUCT_FIELD_ERRORS: Record<ProductField, string> = {
  name: "nameRequired",
  unitPrice: "unitPriceInvalid",
  vatRateBps: "vatRateInvalid",
};

// Built per request: the price is typed in major units and stored in minor
// units, and how many decimals it may carry is a property of the tenant's
// currency (plan.md §1.2).
const createProductSchema = (currency: string) =>
  z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional().or(z.literal("")),
    unitPrice: moneyAmountSchema(currency),
    // Shape only; whether the tenant has this rate configured is decided
    // against `vat_rates` below.
    vatRateBps: z.coerce.number().int().min(0).max(10_000).optional(),
  });

export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const ctx = await requireTenantAdmin();
  const values = Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const parsed = createProductSchema(ctx.currency).safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    unitPrice: formData.get("unitPrice"),
    vatRateBps: formData.get("vatRateBps") || undefined,
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (typeof field === "string" && field in PRODUCT_FIELD_ERRORS) {
      const key = field as ProductField;
      return { error: PRODUCT_FIELD_ERRORS[key], field: key, values };
    }
    return { error: "unknown", field: null, values };
  }

  try {
    await createProduct(ctx, {
      name: parsed.data.name,
      description: parsed.data.description || undefined,
      unitPrice: parsed.data.unitPrice,
      // Refuses a rate the tenant has not configured, rather than writing an
      // arbitrary one into the catalog where it would later reach an invoice.
      vatRateBps: await resolveVatRateBps(ctx, parsed.data.vatRateBps),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("vat_rate_not_configured")) {
      return { error: "vatRateInvalid", field: "vatRateBps", values };
    }
    return { error: "unknown", field: null, values };
  }

  revalidatePath("/products");
  return { error: null, field: null, values: {} };
}

export async function toggleProductAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = z.string().min(1).safeParse(formData.get("productId"));
  if (!parsed.success) return;
  const isActive = formData.get("isActive") === "true";
  await updateProduct(ctx, parsed.data, { isActive });
  revalidatePath("/products");
}
