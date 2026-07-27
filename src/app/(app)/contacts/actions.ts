"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/modules/tenancy/context";
import {
  createContact,
  updateContact,
  createTag,
  addTagToContact,
  removeTagFromContact,
} from "@/modules/crm/contacts";
import { createActivity } from "@/modules/crm/activities";

const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(20),
  email: z.string().email().optional().or(z.literal("")),
  source: z.string().max(100).optional().or(z.literal("")),
});

export async function createContactAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const input = createContactSchema.parse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email") || undefined,
    source: formData.get("source") || undefined,
  });

  await createContact(ctx, input);
  revalidatePath("/contacts");
}

const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().max(5000).optional(),
});

export async function updateContactAction(contactId: string, formData: FormData) {
  const ctx = await requireTenantContext();
  const input = updateContactSchema.parse({
    name: formData.get("name") || undefined,
    email: formData.get("email") || undefined,
    notes: formData.get("notes") || undefined,
  });
  await updateContact(ctx, contactId, input);
  revalidatePath(`/contacts/${contactId}`);
}

export async function addNoteAction(contactId: string, formData: FormData) {
  const ctx = await requireTenantContext();
  const note = z.string().min(1).max(5000).parse(formData.get("note"));
  await createActivity(ctx, {
    contactId,
    type: "note",
    payload: { text: note },
    userId: ctx.userId,
  });
  revalidatePath(`/contacts/${contactId}`);
}

export async function createTagAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const name = z.string().min(1).max(100).parse(formData.get("name"));
  await createTag(ctx, { name });
  revalidatePath("/contacts");
}

export async function addTagToContactAction(contactId: string, formData: FormData) {
  const ctx = await requireTenantContext();
  const tagId = z.string().min(1).parse(formData.get("tagId"));
  await addTagToContact(ctx, contactId, tagId);
  revalidatePath(`/contacts/${contactId}`);
}

export async function removeTagFromContactAction(contactId: string, tagId: string) {
  const ctx = await requireTenantContext();
  await removeTagFromContact(ctx, contactId, tagId);
  revalidatePath(`/contacts/${contactId}`);
}
