import { createEventBus } from "@/lib/events";

// Chat widget domain events (PLAN.md §5). One trigger reaches the automation
// engine — `chat.captured` — because that is the moment a contact exists for
// a flow to act on. A trigger on every visitor message would be a bill, not
// a feature.

export type ChatEventPayload = {
  tenantId: string;
  chatConversationId: string;
  widgetId: string;
  siteId: string;
};

export const chatEvents = createEventBus<{
  "chat.started": ChatEventPayload;
  "chat.captured": ChatEventPayload & { contactId: string; dealId: string | null };
  "chat.handoff": ChatEventPayload;
}>();
