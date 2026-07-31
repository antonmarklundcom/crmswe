# Node.js / Express

Form markup is in `php.md` — only the `action` changes (`/api/contacto`).

## Shared helper

Keep the CRM call in one module so every form on the site behaves the same:

```js
// lib/vendercrm.js
import crypto from "node:crypto";

const CRM_URL = process.env.VENDERCRM_URL ?? "https://CRM_URL";

/** Same phone within the same hour is the same submission. */
export function idempotencyKey(phone) {
  return crypto
    .createHash("sha256")
    .update(`${phone}|${new Date().toISOString().slice(0, 13)}`)
    .digest("hex");
}

/** First-touch attribution cookie written by vc-attribution.js. */
export function readAttribution(cookieValue) {
  try {
    return JSON.parse(decodeURIComponent(cookieValue ?? "%7B%7D"));
  } catch {
    return {};
  }
}

/**
 * Posts a lead. Never throws: the caller must be able to thank the visitor
 * even when the CRM is down. Returns {ok, status} for logging.
 */
export async function sendLead(lead) {
  const body = Object.fromEntries(
    Object.entries(lead).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );

  try {
    const response = await fetch(`${CRM_URL}/api/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.VENDERCRM_API_KEY,
      },
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
```

## Route

```js
import express from "express";
import cookieParser from "cookie-parser";
import { sendLead, idempotencyKey, readAttribution } from "./lib/vendercrm.js";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.post("/api/contacto", async (req, res) => {
  const { nombre, telefono, email, mensaje, website } = req.body;

  // Honeypot — accept silently.
  if (website) return res.redirect("/gracias");

  const phone = (telefono ?? "").trim();
  if (!phone) return res.redirect("/contacto?error=telefono");

  const attr = readAttribution(req.cookies?.vc_attr);

  await sendLead({
    phone,
    name: nombre,
    email,
    message: mensaje,
    source: "formulario-contacto",
    page_url: attr.landing_page,
    referrer: attr.referrer,
    utm_source: attr.utm_source,
    utm_medium: attr.utm_medium,
    utm_campaign: attr.utm_campaign,
    utm_term: attr.utm_term,
    utm_content: attr.utm_content,
    gclid: attr.gclid,
    fbclid: attr.fbclid,
    idempotency_key: idempotencyKey(phone),
  });

  // Redirect regardless — sendLead already logged any failure.
  res.redirect("/gracias");
});
```

## If the form submits with JS (fetch)

Post to your own route, not to the CRM. Return JSON and let the page show its
own success state:

```js
app.post("/api/contacto", async (req, res) => {
  // …same as above…
  res.json({ ok: true });          // always ok: the visitor's part succeeded
});
```

Returning `{ok: true}` even when the CRM call failed is deliberate — the
visitor did their part, and the failure is yours to fix from the log. Don't
surface CRM plumbing to them.

## Extra fields

Anything the form collects beyond the standard set goes in `fields`, where it
lands on the contact's timeline:

```js
fields: {
  servicio: req.body.servicio,
  presupuesto: req.body.presupuesto,
  urgencia: req.body.urgencia,
}
```
