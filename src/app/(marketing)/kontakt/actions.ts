"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp } from "@/lib/http/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site-config";
import { idempotencyKey, readAttribution, sendLead } from "@/lib/vendercrm-lead";

/**
 * The marketing site's qualifying form (plan.md §6.2 — dogfoods the CRM's
 * own /api/v1/leads lane). A Server Action rather than a client fetch for
 * two reasons: the site API key must never reach the browser, and the form
 * then works with JavaScript disabled or still loading.
 */
// Same shape as every other action in the app: the payload is parsed, not
// trusted (PLAN.md §3.3). Oversized fields are cut rather than rejected —
// this is a public form and a long "meddelande" is a real visitor, not an
// attack — but the phone, the one field the CRM keys on, must be present.
const contactSchema = z.object({
  telefon: z.string().trim().min(6).max(40),
  namn: z.string().trim().max(200).optional(),
  foretag: z.string().trim().max(200).optional(),
  email: z.string().trim().max(320).optional(),
  bransch: z.string().trim().max(200).optional(),
  meddelande: z.string().trim().max(4000).optional(),
});

// Public and unauthenticated, so it gets the same treatment as the lead
// ingest endpoint (PLAN.md §13 H3 #4): a fixed per-IP window, ahead of any
// work — including the outbound call to the CRM.
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 10 * 60 * 1000;

export async function submitContactAction(formData: FormData) {
  // Honeypot: accept silently and post nothing. A bot that fills every field
  // must not be able to tell it was rejected.
  if (String(formData.get("website") ?? "").trim() !== "") {
    redirect("/kontakt?skickat=1");
  }

  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);

  if (checkRateLimit(`marketing:kontakt:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS).limited) {
    // Same answer as the honeypot: a flood gets a thank-you page and no
    // lead, rather than a signal about what tripped.
    redirect("/kontakt?skickat=1");
  }

  const parsed = contactSchema.safeParse({
    telefon: formData.get("telefon") ?? "",
    namn: formData.get("namn") ?? undefined,
    foretag: formData.get("foretag") ?? undefined,
    email: formData.get("email") ?? undefined,
    bransch: formData.get("bransch") ?? undefined,
    meddelande: formData.get("meddelande") ?? undefined,
  });

  if (!parsed.success) {
    redirect("/kontakt?error=telefon");
  }

  const phone = parsed.data.telefon;
  const name = parsed.data.namn ?? "";
  const company = parsed.data.foretag ?? "";
  const email = parsed.data.email ?? "";
  const sector = parsed.data.bransch ?? "";
  const message = parsed.data.meddelande ?? "";

  const attribution = readAttribution((await cookies()).get("vc_attr")?.value);
  const referer = requestHeaders.get("referer") ?? undefined;

  // Never send pipeline, stage, owner or tag: routing lives on the site record
  // in the CRM so it can be changed without a deploy.
  await sendLead({
    phone,
    name: name || undefined,
    email: email || undefined,
    message: message || undefined,
    source: "CRM Swe:kontakt",
    page_url: attribution.landing_page ?? `${SITE_URL}/kontakt`,
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
      ...(company ? { foretag: company } : {}),
      ...(sector ? { bransch: sector } : {}),
    },
  });

  // Deliberately outside any try/catch: redirect() unwinds by throwing, and
  // sendLead never throws — so a CRM outage still thanks the visitor and
  // leaves the failure in the server log rather than on their screen.
  redirect("/kontakt?skickat=1");
}
