import { NextResponse } from "next/server";
import { clientIpOrNull } from "@/lib/http/client-ip";
import { receiveHookPayload } from "@/modules/sites/hooks";

// Inbound webhook receiver (PLAN.md §5.2) — the second ingest lane, for
// client sites on Elementor, Wix, Webflow and Zapier/Make.
//
// Like /api/v1/leads, this is deliberately NOT CORS-enabled: the caller is
// the builder's server, never the visitor's browser. The token in the path
// is a real credential — it is just a weaker one than a header key, since a
// URL ends up in third-party logs, which is why this lane has a tighter rate
// limit and its own revocation.

// Same reasoning as /api/v1/leads: the response body is what Elementor,
// Wix and Zapier show the person wiring the form up, so it stays as-is
// rather than moving to the internal error shape (§13 H9 #2).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const contentType = request.headers.get("content-type") ?? "";

  let payload: unknown;
  try {
    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      // Elementor's "Webhook" action and several Make scenarios post form
      // data rather than JSON. Flattening it to an object here means the
      // mapping sees one shape regardless of how the builder sends it.
      const form = await request.formData();
      const flat: Record<string, string> = {};
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") flat[key] = value;
      }
      payload = flat;
    } else {
      // Some builders send JSON with no content type at all.
      payload = JSON.parse(await request.text());
    }
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const outcome = await receiveHookPayload(token, payload, {
    ipAddress: clientIpOrNull(request.headers),
    userAgent: request.headers.get("user-agent") ?? undefined,
    contentType: contentType || undefined,
    pageUrl: request.headers.get("referer") ?? undefined,
  });

  if (!outcome.ok) {
    if (outcome.status === 202) {
      // Capture mode: the payload was stored so the tenant can build a
      // mapping against the real shape. Not an error — the client's webhook
      // is wired up correctly, and telling Elementor otherwise would have
      // them "fixing" a working configuration.
      return NextResponse.json(
        { status: "captured", message: "Payload captured; configure the field mapping in the CRM." },
        { status: 202 },
      );
    }
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  const { result } = outcome.result;
  return NextResponse.json(
    {
      contactId: result.contactId,
      dealId: result.dealId,
      submissionId: result.submissionId,
      duplicate: result.duplicate,
    },
    { status: result.duplicate ? 200 : 201 },
  );
}
