"use server";

import { z } from "zod";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { moneyAmountSchema } from "@/lib/money-schema";
import { revalidatePath } from "next/cache";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import { createPlan } from "@/modules/tenancy/plans";

const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  durationMonths: z.coerce.number().refine((v): v is 3 | 6 | 12 => [3, 6, 12].includes(v)),
  price: moneyAmountSchema(DEFAULT_CURRENCY, { min: 1 }),
});

// useActionState-shaped (PLAN.md §10 1R #6): a missing name or a bad price
// comes back inline instead of throwing to Next's error page.
export type PlanField = "name" | "price";

export type PlanFormState = {
  error: string | null;
  field: PlanField | null;
  values: Record<string, string>;
};

export async function createPlanAction(
  _prevState: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  const ctx = await requireSuperadminContext();
  const values = Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const parsed = createPlanSchema.safeParse({
    name: formData.get("name"),
    durationMonths: formData.get("durationMonths"),
    price: formData.get("price"),
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "name") return { error: "nameRequired", field: "name", values };
    if (field === "price") return { error: "priceInvalid", field: "price", values };
    return { error: "unknown", field: null, values };
  }

  try {
    await createPlan(ctx, parsed.data);
  } catch {
    return { error: "unknown", field: null, values };
  }

  revalidatePath("/plans");
  return { error: null, field: null, values: {} };
}
