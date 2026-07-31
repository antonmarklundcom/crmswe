"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/modules/tenancy/context";
import { addTagToContact, getContact, updateContact } from "@/modules/crm/contacts";
import { createDeal } from "@/modules/crm/deals";

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
