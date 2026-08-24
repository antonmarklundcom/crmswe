import { NextResponse } from "next/server";
import { clientIp, clientIpOrNull } from "@/lib/http/client-ip";
import { postVisitorMessage } from "@/modules/chatwidget/public";

// A visitor message, and the reply (docs/SPEC-CHAT-WIDGET.md §3).
//
// Called from our own iframe at /w/[widgetKey], so this is same-origin and
// deliberately NOT CORS-enabled — that is the whole reason the widget is an
// iframe rather than a script talking to a cross-origin API.
//
// A tripped spend cap answers 200 with the "a person is coming" shape, never
// an error: the visitor must not be shown the tenant's billing state.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> },
) {
  const { widgetKey } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 422 });
  }

  const outcome = await postVisitorMessage(widgetKey, body, {
    origin: request.headers.get("origin"),
    ipAddress: clientIpOrNull(request.headers),
    ipKey: clientIp(request.headers),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  return NextResponse.json(outcome.data);
}
