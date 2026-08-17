"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { idempotencyKey, readAttribution, sendLead } from "@/lib/vendercrm";

/**
 * Contact form handler for clientes.com.py.
 *
 * Written as a Server Action rather than a client fetch so the form works
 * with JavaScript disabled or still loading — which is exactly the state a
 * lot of paid-ad traffic arrives in on mobile data.
 */
export async function submitContactAction(formData: FormData) {
  // Honeypot: accept silently so the bot sees success and doesn't retry.
  if (formData.get("website")) redirect("/gracias");

  const phone = String(formData.get("telefono") ?? "").trim();
  if (!phone) redirect("/?error=telefono#contacto");

  const cookieStore = await cookies();
  const attr = readAttribution(cookieStore.get("vc_attr")?.value);
  const headerList = await headers();

  const servicio = String(formData.get("servicio") ?? "").trim();

  await sendLead({
    phone,
    name: String(formData.get("nombre") ?? ""),
    email: String(formData.get("email") ?? ""),
    message: String(formData.get("mensaje") ?? ""),
    source: "clientes.com.py",
    page_url: attr.landing_page ?? headerList.get("referer") ?? undefined,
    referrer: attr.referrer,
    utm_source: attr.utm_source,
    utm_medium: attr.utm_medium,
    utm_campaign: attr.utm_campaign,
    utm_term: attr.utm_term,
    utm_content: attr.utm_content,
    gclid: attr.gclid,
    fbclid: attr.fbclid,
    idempotency_key: idempotencyKey(phone),
    fields: servicio ? { servicio } : undefined,
  });

  // Outside any try/catch — redirect() unwinds by throwing, and sendLead has
  // already logged whatever went wrong.
  redirect("/gracias");
}
