"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SITE_URL } from "@/lib/site-config";
import { idempotencyKey, readAttribution, sendLead } from "@/lib/vendercrm-lead";

/**
 * The marketing site's qualifying form (plan: THE conversion page). A Server
 * Action rather than a client fetch for two reasons: the site API key must
 * never reach the browser, and the form then works with JavaScript disabled
 * or still loading — which is most of the first seconds of an ad click on a
 * Paraguayan mobile connection.
 */
export async function submitContactAction(formData: FormData) {
  // Honeypot: accept silently and post nothing. A bot that fills every field
  // must not be able to tell it was rejected.
  if (String(formData.get("website") ?? "").trim() !== "") {
    redirect("/contacto?enviado=1");
  }

  const phone = String(formData.get("telefono") ?? "").trim();
  if (phone.length < 6) {
    redirect("/contacto?error=telefono");
  }

  const name = String(formData.get("nombre") ?? "").trim();
  const company = String(formData.get("empresa") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const sector = String(formData.get("rubro") ?? "").trim();
  const message = String(formData.get("mensaje") ?? "").trim();

  const attribution = readAttribution((await cookies()).get("vc_attr")?.value);
  const referer = (await headers()).get("referer") ?? undefined;

  // Never send pipeline, stage, owner or tag: routing lives on the site record
  // in the CRM so it can be changed without a deploy.
  await sendLead({
    phone,
    name: name || undefined,
    email: email || undefined,
    message: message || undefined,
    source: "clientes.com.py:contacto",
    page_url: attribution.landing_page ?? `${SITE_URL}/contacto`,
    referrer: attribution.referrer ?? referer,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    utm_term: attribution.utm_term,
    utm_content: attribution.utm_content,
    gclid: attribution.gclid,
    fbclid: attribution.fbclid,
    idempotency_key: idempotencyKey(phone),
    // Everything the endpoint has no column for, kept on the timeline so the
    // person taking the call has the context.
    fields: {
      ...(company ? { empresa: company } : {}),
      ...(sector ? { rubro: sector } : {}),
    },
  });

  // Deliberately outside any try/catch: redirect() unwinds by throwing, and
  // sendLead never throws — so a CRM outage still thanks the visitor and
  // leaves the failure in the server log rather than on their screen.
  redirect("/contacto?enviado=1");
}
