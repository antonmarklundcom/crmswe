import { eq } from "drizzle-orm";
import { activities } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Contact/deal activity timeline (PLAN.md §4, §5). Other modules (forms,
// whatsapp, quotes) append their own activity rows as they land — this file
// only owns the read/write primitives, not what triggers them.

export type ActivityType =
  | "note"
  | "call"
  | "stage_change"
  | "form_submission"
  | "quote_sent"
  | "system";

export type CreateActivityInput = {
  contactId: string;
  dealId?: string;
  type: ActivityType;
  payload?: Record<string, unknown>;
  userId?: string;
};

export async function createActivity(ctx: TenantContext, input: CreateActivityInput) {
  const id = newId();
  await tenantDb(ctx)
    .insert(activities)
    .values({
      id,
      contactId: input.contactId,
      dealId: input.dealId,
      type: input.type,
      payload: input.payload ?? {},
      userId: input.userId,
    });
  const [row] = await tenantDb(ctx).select(activities, eq(activities.id, id));
  return row ?? null;
}

export async function listActivitiesForContact(ctx: TenantContext, contactId: string) {
  const rows = await tenantDb(ctx).select(activities, eq(activities.contactId, contactId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
