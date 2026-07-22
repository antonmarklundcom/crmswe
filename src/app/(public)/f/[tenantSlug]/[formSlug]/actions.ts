"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { submitForm } from "@/modules/forms/submissions";

export async function submitFormAction(
  tenantSlug: string,
  formSlug: string,
  formData: FormData,
) {
  // Honeypot (PLAN.md §5): a hidden field bots fill in and humans never see.
  if (formData.get("_hp")) {
    return;
  }

  const data: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "_hp") continue;
    data[key] = String(value);
  }

  const headersList = await headers();
  const result = await submitForm(tenantSlug, formSlug, {
    data,
    ipAddress: headersList.get("x-forwarded-for") ?? undefined,
    userAgent: headersList.get("user-agent") ?? undefined,
  });

  redirect(result.redirectUrl || `/f/${tenantSlug}/${formSlug}/gracias`);
}
