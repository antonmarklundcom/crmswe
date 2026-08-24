"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantAdmin, requireTenantContext } from "@/modules/tenancy/context";
import { writeAuditLog } from "@/modules/tenancy/audit";
import { addTagToContact, getContact, updateContact } from "@/modules/crm/contacts";
import { createDeal } from "@/modules/crm/deals";
import { RecordDeleteError, deleteContactRecord } from "@/modules/crm/deletion";

// Bulk actions from the contacts table's selection bar (PLAN.md §10 1J #1).
// Called directly from the client table as plain async functions — there is
// no HTML form here, so each takes real arguments rather than FormData; the
// "use server" directive is what makes that callable from a client
// component at all. Every action loops the same tenant-scoped services the
// single-contact UI already uses, so a bulk action can't do anything a rep
// couldn't already do one contact at a time.

const idsSchema = z.array(z.string().min(1)).min(1).max(500);

export async function bulkAddTagAction(contactIds: string[], tagId: string) {
  const ctx = await requireTenantContext();
  const ids = idsSchema.parse(contactIds);
  const tag = z.string().min(1).parse(tagId);

  await Promise.all(ids.map((contactId) => addTagToContact(ctx, contactId, tag)));
  revalidatePath("/contacts");
}

export async function bulkAssignOwnerAction(contactIds: string[], ownerUserId: string) {
  const ctx = await requireTenantContext();
  const ids = idsSchema.parse(contactIds);
  // Empty string from the "sin responsable" option means unassign.
  const owner = ownerUserId || undefined;

  await Promise.all(ids.map((contactId) => updateContact(ctx, contactId, { ownerUserId: owner })));
  revalidatePath("/contacts");
}

export async function bulkAddToPipelineAction(
  contactIds: string[],
  pipelineId: string,
  stageId: string,
) {
  const ctx = await requireTenantContext();
  const ids = idsSchema.parse(contactIds);
  const pipeline = z.string().min(1).parse(pipelineId);
  const stage = z.string().min(1).parse(stageId);

  // One deal per selected contact — same shape createDealAction already
  // produces for a single contact (modules/crm/deals.ts owns the activity/
  // event side effects of a new deal, so there's nothing bulk-specific to
  // duplicate here).
  const contacts = await Promise.all(ids.map((contactId) => getContact(ctx, contactId)));

  await Promise.all(
    contacts
      .filter((contact): contact is NonNullable<typeof contact> => contact !== null)
      .map((contact) =>
        createDeal(ctx, {
          contactId: contact.id,
          pipelineId: pipeline,
          stageId: stage,
          title: contact.name,
        }),
      ),
  );
  revalidatePath("/contacts");
  revalidatePath("/pipeline");
}

export type BulkDeleteResult = {
  deleted: number;
  /** Selected contacts the history guard refused — the count the bar reports
   * back so a partial run is never mistaken for a clean one. */
  blocked: number;
};

/**
 * Deleting a batch of contacts imported or captured by mistake — the one
 * bulk action that destroys data, so it is admin-only and audited per
 * contact, exactly like the single-contact delete it loops.
 *
 * It loops `deleteContactRecord` rather than issuing one wide DELETE
 * precisely so the history guard (modules/crm/deletion.ts) applies to every
 * row: a selection of forty leads that happens to include one with a
 * numbered quote deletes the thirty-nine and keeps that one, and says so.
 * Sequential, not `Promise.all`, because each delete opens a transaction and
 * fanning out a hundred of those at once is how a shared MySQL connection
 * pool falls over.
 */
export async function bulkDeleteContactsAction(contactIds: string[]): Promise<BulkDeleteResult> {
  const ctx = await requireTenantAdmin();
  const ids = idsSchema.parse(contactIds);

  let deleted = 0;
  let blocked = 0;

  for (const contactId of ids) {
    try {
      await deleteContactRecord(ctx, contactId);
    } catch (err) {
      if (err instanceof RecordDeleteError) {
        // "Not found" counts as blocked too: it means somebody else got
        // there first, and the honest report is "this one is not mine to
        // count as deleted".
        blocked += 1;
        continue;
      }
      throw err;
    }

    deleted += 1;
    await writeAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      impersonatorUserId: ctx.impersonatorUserId,
      action: "contact.deleted",
      entity: "contact",
      entityId: contactId,
    });
  }

  revalidatePath("/contacts");
  return { deleted, blocked };
}
