"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import { connectAccountManually } from "@/modules/whatsapp/accounts";
import { syncTemplates } from "@/modules/whatsapp/templates";

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

// Manual "sync" button (§6.4). Runs inline rather than through the
// recurring job so the admin sees the result immediately — and so it can't
// seed a second nightly chain alongside the one connect already started.
export async function syncTemplatesAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const accountId = z.string().min(1).parse(formData.get("accountId"));
  await syncTemplates(ctx, accountId);
  revalidatePath("/whatsapp");
}
