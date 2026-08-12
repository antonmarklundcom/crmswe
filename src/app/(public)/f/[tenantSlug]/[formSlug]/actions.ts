"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { submitForm } from "@/modules/forms/submissions";
import { TURNSTILE_RESPONSE_FIELD } from "@/lib/turnstile";

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
    if (key === "_hp" || key === TURNSTILE_RESPONSE_FIELD) continue;
    data[key] = String(value);
  }

  const headersList = await headers();
  const result = await submitForm(tenantSlug, formSlug, {
    data,
    // Present only when the form's linked site has Turnstile on (§5.2);
    // submitForm decides whether it's required, not this action.
    turnstileToken: formData.get(TURNSTILE_RESPONSE_FIELD)?.toString(),
    ipAddress: headersList.get("x-forwarded-for") ?? undefined,
    userAgent: headersList.get("user-agent") ?? undefined,
  });

  redirect(result.redirectUrl || `/f/${tenantSlug}/${formSlug}/gracias`);
}
