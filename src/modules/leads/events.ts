import { createEventBus } from "@/lib/events";

// Fired for every inbound lead regardless of entry path (§5.1) — the hosted
// form pages and the public ingest API both go through
// recordLeadSubmission. 1G's automation triggers hang off this.
export type LeadEvents = {
  "lead.received": {
    tenantId: string;
    contactId: string;
    dealId: string | null;
    submissionId: string;
    siteId: string | null;
    formId: string | null;
  };
};

export const leadEvents = createEventBus<LeadEvents>();
