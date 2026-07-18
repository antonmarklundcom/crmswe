"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import { createPlan } from "@/modules/tenancy/plans";

const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  durationMonths: z.coerce.number().refine((v): v is 3 | 6 | 12 => [3, 6, 12].includes(v), {
    message: "durationMonths must be 3, 6, or 12",
  }),
  price: z.coerce.number().int().positive(),
});

export async function createPlanAction(formData: FormData) {
  const ctx = await requireSuperadminContext();
  const input = createPlanSchema.parse({
    name: formData.get("name"),
    durationMonths: formData.get("durationMonths"),
    price: formData.get("price"),
  });

  await createPlan(ctx, input);
  revalidatePath("/plans");
}
