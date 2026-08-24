import { NextResponse } from "next/server";
import { clientIp, clientIpOrNull } from "@/lib/http/client-ip";
import { postCapture } from "@/modules/chatwidget/public";

// Name + phone → a contact, through recordLeadSubmission (§5.1's engine).
// Chat is a third lead entry path, not a third lead model.

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

  const outcome = await postCapture(widgetKey, body, {
    origin: request.headers.get("origin"),
    ipAddress: clientIpOrNull(request.headers),
    ipKey: clientIp(request.headers),
  });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  return NextResponse.json(outcome.data, { status: 201 });
}
