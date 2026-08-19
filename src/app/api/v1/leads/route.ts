import { NextResponse } from "next/server";
import { ingestLead } from "@/modules/sites/ingest";

// Public lead ingest (PLAN.md §5.1). Server-to-server only — the site's own
// backend calls this with its key. Deliberately not CORS-enabled: browsers
// are not meant to reach it, which is what keeps the key out of page source
// and bots off the endpoint.
//
// This route keeps its own `{ error: "<message>" }` body rather than moving
// to lib/api/guards' uniform shape (§13 H9 #2): the body is a published
// contract that customer sites already parse and log, and the API key check
// is inseparable from the key → site → tenant resolution inside ingestLead.
// Changing it would break integrations that are live on other people's
// servers, which is not a refactor's call to make.

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 422 });
  }

  const outcome = await ingestLead(request.headers.get("x-api-key"), body, {
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  const { result } = outcome;
  return NextResponse.json(
    {
      contactId: result.contactId,
      dealId: result.dealId,
      submissionId: result.submissionId,
      duplicate: result.duplicate,
    },
    // A replayed idempotency key returns the original result as 200 rather
    // than 201 — same body, but the caller can tell nothing new was created.
    { status: result.duplicate ? 200 : 201 },
  );
}
