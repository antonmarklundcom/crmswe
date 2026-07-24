"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import { connectAccountManually } from "@/modules/whatsapp/accounts";

const connectSchema = z.object({
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  displayNumber: z.string().optional().or(z.literal("")),
  accessToken: z.string().min(1),
});

export async function connectAccountAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const input = connectSchema.parse({
    wabaId: formData.get("wabaId"),
    phoneNumberId: formData.get("phoneNumberId"),
    displayNumber: formData.get("displayNumber") || undefined,
    accessToken: formData.get("accessToken"),
  });

  await connectAccountManually(ctx, input);
  revalidatePath("/whatsapp");
}
