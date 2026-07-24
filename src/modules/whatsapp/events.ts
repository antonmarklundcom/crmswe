import { createEventBus } from "@/lib/events";

export type WhatsappEvents = {
  "wa.message_received": {
    tenantId: string;
    conversationId: string;
    contactId: string;
    messageId: string;
  };
};

export const whatsappEvents = createEventBus<WhatsappEvents>();
