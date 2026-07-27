import { createEventBus } from "@/lib/events";

// CRM domain events (PLAN.md §5, §7.1 trigger list). No listeners yet — 1F
// (automation flow builder) registers `automation.trigger` job enqueuing
// against these; the bus exists now so contacts/deals/tags don't change
// shape when that lands.
export type CrmEvents = {
  "contact.created": { tenantId: string; contactId: string };
  "deal.stage_changed": {
    tenantId: string;
    dealId: string;
    fromStageId: string;
    toStageId: string;
  };
  "tag.added": { tenantId: string; contactId: string; tagId: string };
};

export const crmEvents = createEventBus<CrmEvents>();
