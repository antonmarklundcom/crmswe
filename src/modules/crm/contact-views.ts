import { asc, eq } from "drizzle-orm";
import { contactViews } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Saved contact views (PLAN.md §10 1J #1): a named filter set, shared with
// the whole business the way the pipeline is (§1.2 "in-tenant visibility").
// The view stores a querystring rather than a structured filter object on
// purpose — the URL is already the list's state, so a view is just a link
// somebody named, and a filter added to the list later needs no migration
// here. The caller is responsible for handing over a *canonical* querystring
// (`serializeContactView`), which is what keeps arbitrary URL text out of it.

export type ContactView = typeof contactViews.$inferSelect;

export class ContactViewNameTakenError extends Error {
  constructor() {
    super("contact_view_name_taken");
  }
}

export async function listContactViews(ctx: TenantContext): Promise<ContactView[]> {
  return tenantDb(ctx).select(contactViews).orderBy(asc(contactViews.name));
}

export async function createContactView(
  ctx: TenantContext,
  input: { name: string; query: string },
): Promise<ContactView | null> {
  const id = newId();
  // Unique on (tenant_id, name): saving twice under the same name is a rename
  // of the same idea, not a second view, so the collision is reported rather
  // than silently producing two "Leads de hoy".
  const existing = await tenantDb(ctx)
    .select(contactViews, eq(contactViews.name, input.name))
    .limit(1);
  if (existing.length > 0) throw new ContactViewNameTakenError();

  await tenantDb(ctx).insert(contactViews).values({
    id,
    createdByUserId: ctx.userId,
    name: input.name,
    query: input.query,
  });

  const [created] = await tenantDb(ctx).select(contactViews, eq(contactViews.id, id)).limit(1);
  return created ?? null;
}

/**
 * Deleting a view destroys no CRM data — it is a bookmark. An agent may
 * remove one they saved; an admin may remove any, since a stale shared view
 * is the admin's to tidy.
 */
export async function deleteContactView(ctx: TenantContext, viewId: string): Promise<void> {
  const [view] = await tenantDb(ctx).select(contactViews, eq(contactViews.id, viewId)).limit(1);
  if (!view) return;
  if (ctx.role !== "admin" && view.createdByUserId !== ctx.userId) {
    throw new Error("No podés borrar una vista que guardó otra persona");
  }

  await tenantDb(ctx).delete(contactViews, eq(contactViews.id, viewId));
}
