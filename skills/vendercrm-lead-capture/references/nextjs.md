# Next.js (App Router)

Two things are easy to get wrong here, and both leak the key:

- `NEXT_PUBLIC_*` is inlined into the client bundle. The key must be
  `VENDERCRM_API_KEY`, with **no** `NEXT_PUBLIC_` prefix.
- A `"use client"` component cannot hold the key. The CRM call belongs in a
  Server Action or a Route Handler.

The `lib/vendercrm.ts` helper from `node.md` works unchanged — it is plain
`fetch`. Type it and reuse it.

## Server Action (preferred)

The form works without JavaScript, which matters for ad traffic on poor
connections.

```tsx
// app/contacto/actions.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sendLead, idempotencyKey, readAttribution } from "@/lib/vendercrm";

export async function submitContactAction(formData: FormData) {
  // Honeypot — accept silently.
  if (formData.get("website")) redirect("/gracias");

  const phone = String(formData.get("telefono") ?? "").trim();
  if (!phone) redirect("/contacto?error=telefono");

  const attr = readAttribution((await cookies()).get("vc_attr")?.value);

  await sendLead({
    phone,
    name: String(formData.get("nombre") ?? ""),
    email: String(formData.get("email") ?? ""),
    message: String(formData.get("mensaje") ?? ""),
    source: "formulario-contacto",
    page_url: attr.landing_page,
    referrer: attr.referrer,
    utm_source: attr.utm_source,
    utm_medium: attr.utm_medium,
    utm_campaign: attr.utm_campaign,
    gclid: attr.gclid,
    fbclid: attr.fbclid,
    idempotency_key: idempotencyKey(phone),
  });

  redirect("/gracias");
}
```

```tsx
// app/contacto/page.tsx
import { submitContactAction } from "./actions";

export default function ContactPage() {
  return (
    <form action={submitContactAction}>
      <input name="nombre" required />
      <input name="telefono" type="tel" required placeholder="0981 123 456" />
      <input name="email" type="email" />
      <textarea name="mensaje" rows={4} />
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px" }}
      />
      <button type="submit">Enviar</button>
    </form>
  );
}
```

`redirect()` throws internally to unwind — so call it *after* `sendLead`, never
inside a `try` that would swallow it.

## Route Handler (when the form is client-side)

```ts
// app/api/contacto/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sendLead, idempotencyKey, readAttribution } from "@/lib/vendercrm";

export async function POST(request: Request) {
  const body = await request.json();
  if (body.website) return NextResponse.json({ ok: true });

  const phone = String(body.telefono ?? "").trim();
  if (!phone) {
    return NextResponse.json({ ok: false, error: "telefono" }, { status: 422 });
  }

  const attr = readAttribution((await cookies()).get("vc_attr")?.value);

  await sendLead({
    phone,
    name: body.nombre,
    email: body.email,
    message: body.mensaje,
    source: "formulario-contacto",
    page_url: attr.landing_page,
    utm_source: attr.utm_source,
    utm_campaign: attr.utm_campaign,
    idempotency_key: idempotencyKey(phone),
  });

  return NextResponse.json({ ok: true });
}
```

## Attribution script

```tsx
// app/layout.tsx
import Script from "next/script";

<Script src="https://CRM_URL/vc-attribution.js" strategy="afterInteractive" />
```

## Static export (`output: "export"`)

There is no server, so neither approach above exists. Use the CRM's hosted form
(see the main SKILL.md) — or drop the static export if server-side capture and
attribution matter for this site.
