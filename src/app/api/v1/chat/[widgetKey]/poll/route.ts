import { NextResponse } from "next/server";
import { clientIp, clientIpOrNull } from "@/lib/http/client-ip";
import { pollMessages } from "@/modules/chatwidget/public";

// New agent/AI messages since a timestamp (docs/SPEC-CHAT-WIDGET.md §3).
//
// Polling rather than websockets, and the reason is the platform, not taste:
// §2.1 locks a single Node process on Hostinger managed hosting with no Redis
// and no worker dynos, so a websocket fan-out has nowhere to live.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> },
) {
  const { widgetKey } = await params;
  const url = new URL(request.url);
  const visitorId = url.searchParams.get("visitorId");
  if (!visitorId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 422 });
  }

  const outcome = await pollMessages(widgetKey, visitorId, url.searchParams.get("since"), {
    origin: request.headers.get("origin"),
    ipAddress: clientIpOrNull(request.headers),
    ipKey: clientIp(request.headers),
  });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  return NextResponse.json(outcome.data);
}
