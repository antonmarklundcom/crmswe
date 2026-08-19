import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { reportError } from "@/lib/observability";
import { enqueue } from "@/lib/queue";
import { verifySignature, persistRawEvent } from "@/modules/whatsapp/webhook";

// PLAN.md §6.3: one endpoint for the whole platform, Meta routes all
// tenants' traffic here by phone_number_id. GET is the one-time webhook
// verification handshake; POST is the actual event delivery.

// Meta's webhook expects plain-text bodies (and the verification handshake
// expects the challenge echoed verbatim), so this route does not use the
// JSON guards in lib/api/guards — its "credential" is the signature check
// below, not a header a guard could read.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  // Rule 2 (§6.3): persist raw + enqueue + return 200 — fast, no business
  // logic in the handler. Meta retries on non-200/slow responses and
  // eventually pauses the subscription on persistent failure.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Still ack — an unparseable body isn't something Meta retrying will
    // fix, and we don't want the subscription paused over it.
    return new NextResponse("OK", { status: 200 });
  }

  const phoneNumberId = extractPhoneNumberId(payload);

  // Persisting or enqueueing can only fail on infrastructure (MySQL down,
  // disk full). Meta retries a non-200, which is what we want here — but
  // until now the failure was invisible, so a paused subscription was the
  // first symptom.
  try {
    const eventId = await persistRawEvent(payload, phoneNumberId);
    await enqueue("whatsapp.process_event", { eventId });
  } catch (err) {
    reportError(err, {
      tags: { area: "webhook", provider: "whatsapp" },
      extra: { phoneNumberId },
    });
    return new NextResponse("Error", { status: 500 });
  }

  return new NextResponse("OK", { status: 200 });
}

function extractPhoneNumberId(payload: unknown): string | null {
  try {
    const value = (payload as {
      entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }>;
    }).entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    return value ?? null;
  } catch {
    return null;
  }
}
