import { createEventBus } from "@/lib/events";

// Booking domain events (PLAN.md §5 "events"). A typed function registry, not
// a bus: listeners fan out synchronously and enqueue jobs rather than doing
// work inline. modules/automations/triggers.ts subscribes.

export type BookingEventPayload = {
  tenantId: string;
  bookingId: string;
  bookingTypeId: string;
  contactId: string;
  resourceId: string;
  startsAt: Date;
};

export const bookingEvents = createEventBus<{
  "booking.created": BookingEventPayload;
  "booking.cancelled": BookingEventPayload & { cancelledBy: "contact" | "staff" | "system" };
  "booking.no_show": BookingEventPayload;
}>();
