import { createEventBus } from "@/lib/events";

export type FormsEvents = {
  "form.submitted": { tenantId: string; formId: string; contactId: string; submissionId: string };
};

export const formsEvents = createEventBus<FormsEvents>();
