import { registerHandler } from "@/worker/handlers";
import { processWebhookEvent } from "./webhook";
import { deliverQueuedMessage } from "./send";

// Job handlers for the WhatsApp pipeline (PLAN.md §6.3, §6.4). Imported for
// its registration side effect from worker/handlers.ts, same pattern as
// the built-in queue.test handler.

registerHandler("whatsapp.process_event", async (payload) => {
  const { eventId } = payload as { eventId: string };
  await processWebhookEvent(eventId);
});

registerHandler("whatsapp.send", async (payload, tenantId) => {
  if (!tenantId) throw new Error("whatsapp.send job missing tenantId");
  const { messageId, graphPayload } = payload as {
    messageId: string;
    graphPayload: Record<string, unknown>;
  };
  await deliverQueuedMessage(tenantId, messageId, graphPayload);
});
