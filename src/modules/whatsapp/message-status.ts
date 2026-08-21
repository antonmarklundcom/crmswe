// Delivery-status transitions for outbound messages (PLAN.md §6.3).
//
// Pure, for the same reason inbound-time.ts is: unit-testable without a
// configured environment.
//
// Meta reports a message's progress as separate `statuses` webhooks —
// sent → delivered → read — and §6.3 rule 3 already says redelivery is
// normal. Applying each one blindly means a redelivered `sent` that arrives
// after `read` walks the message *backwards*: the inbox shows one check
// again on a message the customer demonstrably opened. Webhook events are
// deduplicated by message id for inbound messages, but a status event
// carries the id of the message it describes, so the same event can be
// applied more than once by design — the guard has to live here instead.

const STATUS_ORDER = { queued: 0, sent: 1, delivered: 2, read: 3 } as const;

export type MessageStatus = keyof typeof STATUS_ORDER | "failed";

/**
 * Whether an incoming status should overwrite the stored one.
 *
 * `failed` is terminal in both directions: a send that Meta reports as
 * failed stays failed (a late `sent` for the same id is stale), and a
 * failure always wins over an earlier optimistic status, because a rep
 * needs to see that the message never arrived.
 */
export function advancesMessageStatus(
  current: MessageStatus,
  incoming: MessageStatus,
): boolean {
  if (current === "failed") return false;
  if (incoming === "failed") return true;
  return STATUS_ORDER[incoming] > STATUS_ORDER[current];
}
