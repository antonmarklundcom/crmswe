import crypto from "node:crypto";

/**
 * Lead capture for the marketing site (clientes.com.py) into the CRM that
 * runs on the same deployment (crm.clientes.com.py).
 *
 * The API key never reaches the browser: the form posts to a Server Action,
 * which is the only thing that talks to /api/v1/leads. That is also why this
 * module has no "use client" anywhere in its import graph.
 */

const CRM_URL = process.env.VENDERCRM_URL ?? "https://crm.clientes.com.py";

export type Lead = {
  phone: string;
  name?: string;
  email?: string;
  message?: string;
  source?: string;
  page_url?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  idempotency_key: string;
  fields?: Record<string, string | undefined>;
};

/**
 * Same phone within the same hour is the same submission — collapses the
 * double-click and the timed-out-but-succeeded retry, while still letting the
 * same person enquire again tomorrow.
 */
export function idempotencyKey(phone: string): string {
  return crypto
    .createHash("sha256")
    .update(`${phone}|${new Date().toISOString().slice(0, 13)}`)
    .digest("hex");
}

/** First-touch attribution cookie written by vc-attribution.js. */
export function readAttribution(
  cookieValue: string | undefined,
): Record<string, string | undefined> {
  try {
    return JSON.parse(decodeURIComponent(cookieValue ?? "%7B%7D"));
  } catch {
    return {};
  }
}

/**
 * Posts a lead. Deliberately never throws: a visitor who filled in the form
 * must still reach the thank-you page when the CRM is down, and the failure
 * belongs in the log where it can be fixed.
 */
export async function sendLead(lead: Lead): Promise<{ ok: boolean; status: number }> {
  const apiKey = process.env.VENDERCRM_API_KEY;
  if (!apiKey) {
    console.error("VENDERCRM_API_KEY is not set — lead dropped", { phone: lead.phone });
    return { ok: false, status: 0 };
  }

  // The endpoint rejects "" on email, so drop empties rather than sending them.
  const body = Object.fromEntries(
    Object.entries(lead).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );

  try {
    const response = await fetch(`${CRM_URL}/api/v1/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error("VenderCRM lead failed", response.status, await response.text());
    }
    return { ok: response.ok, status: response.status };
  } catch (err) {
    console.error("VenderCRM unreachable", err);
    return { ok: false, status: 0 };
  }
}
