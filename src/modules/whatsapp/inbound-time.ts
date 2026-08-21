// When an inbound WhatsApp message actually happened (PLAN.md §6.3, §6.4).
//
// Pure and free of the db client and of lib/config/env, so it can be unit
// tested without a configured environment — the same reason lib/money.ts and
// lib/phone.ts live outside their modules' service files.
//
// This exists because the 24h free-form window is measured by Meta from the
// moment the *customer* sent their message, not from the moment we got round
// to processing the webhook. Ingestion is deliberately off the request path
// (§6.3: persist raw, enqueue, return 200), so those two clocks are only
// equal when the queue is empty. They are furthest apart exactly when it
// matters: a worker that was down for six hours comes back to a backlog, and
// stamping "now" would tell every one of those conversations that its window
// closes six hours later than it really does. The rep then sends a free-form
// reply the CRM believes is legal, Meta rejects it (error 131047), and the
// message lands in the thread as `failed` for no reason the rep can see.

/**
 * Meta's `timestamp` field is unix **seconds** as a string. Anything
 * unparseable falls back to the receipt time — a missing timestamp must not
 * make the window look infinitely open, and "now" is the conservative
 * reading we already had. A timestamp in the future is treated the same way:
 * only a wrong clock (ours or theirs) produces one, and honoring it would
 * hold the window open past 24h.
 */
export function inboundMessageTime(rawTimestamp: string, receivedAt: Date): Date {
  const seconds = Number(rawTimestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return receivedAt;

  const sentAt = new Date(seconds * 1000);
  if (!Number.isFinite(sentAt.getTime())) return receivedAt;
  if (sentAt.getTime() > receivedAt.getTime()) return receivedAt;
  return sentAt;
}

/**
 * `lastInboundAt` and `lastMessageAt` are high-water marks, so they only
 * ever move forward. Meta redelivers (§6.3 rule 3) and can deliver out of
 * order, and a redelivered older message must not drag the window's start
 * backwards — that would close a window that is genuinely still open.
 */
export function latest(current: Date | null, candidate: Date): Date {
  if (!current) return candidate;
  return current.getTime() >= candidate.getTime() ? current : candidate;
}
