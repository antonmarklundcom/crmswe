import { NextResponse } from "next/server";
import { clientIp, clientIpOrNull } from "@/lib/http/client-ip";
import { publicReserve } from "@/modules/booking/public";

// Create a booking (docs/SPEC-BOOKING.md §5). Server-side validated,
// rate-limited per type and per IP, honeypot + optional Turnstile — the same
// ladder the hosted form pages and the ingest lanes use.
//
// Per-type routing (pipeline, stage, tags, owner) is read from the booking
// type row inside the module, never from this body: §5.1's rule that a leaked
// or guessed public credential cannot reshape someone's pipeline holds here
// too.
//
// Deliberately not CORS-enabled.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; typeSlug: string }> },
) {
  const { tenantSlug, typeSlug } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 422 });
  }

  const outcome = await publicReserve(tenantSlug, typeSlug, body, {
    // The recorded address is nullable (an unknown one is not an address),
    // while the limiter's key is not — see lib/http/client-ip.
    ipAddress: clientIpOrNull(request.headers),
    ipKey: clientIp(request.headers),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  return NextResponse.json(outcome.data, { status: 201 });
}
