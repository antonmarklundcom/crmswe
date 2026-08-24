import { NextResponse } from "next/server";
import { clientIp } from "@/lib/http/client-ip";
import { publicSlots } from "@/modules/booking/public";

// Available slots for the public booking page (docs/SPEC-BOOKING.md §5).
//
// Same-origin only: this is fetched by our own page at /b/[tenantSlug]/[typeSlug]
// so the visitor can page months without a reload. No CORS headers are set,
// which is what keeps §5.1's lock intact — a browser on someone else's origin
// has no business reading a tenant's calendar.
//
// The response carries start times and nothing else: not resource ids, not
// who is free, not how many are left. The public page has no reason to know
// the shape of someone's team.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; typeSlug: string }> },
) {
  const { tenantSlug, typeSlug } = await params;
  const url = new URL(request.url);

  const outcome = await publicSlots(
    tenantSlug,
    typeSlug,
    url.searchParams.get("from"),
    url.searchParams.get("to"),
    clientIp(request.headers),
  );

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  return NextResponse.json({ slots: outcome.data });
}
