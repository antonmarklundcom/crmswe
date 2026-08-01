"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";
import { DEFAULT_COUNTRY } from "@/lib/phone";
import {
  createContact,
  updateContact,
  createTag,
  addTagToContact,
  removeTagFromContact,
} from "@/modules/crm/contacts";
import { createActivity } from "@/modules/crm/activities";
import { sendText, sendTemplate } from "@/modules/whatsapp/send";

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

  const tenant = await getTenant(ctx.tenantId);
  const tenantSettings = (tenant?.settings ?? {}) as TenantSettings;

  await createContact(ctx, input, tenantSettings.defaultCountry ?? DEFAULT_COUNTRY);
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

// Replying from the contact's conversation tab. Same services the inbox
// uses (§6.5 window rules included) — only the revalidation target differs,
// so the rep stays on the contact record instead of being bounced to /inbox.
const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().min(1).max(4096),
});

export async function sendContactMessageAction(contactId: string, formData: FormData) {
  const ctx = await requireTenantContext();
  const input = sendMessageSchema.parse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });

  await sendText(ctx, input);
  revalidatePath(`/contacts/${contactId}`);
}

const sendContactTemplateSchema = z.object({
  conversationId: z.string().min(1),
  template: z.string().min(1).includes("|"),
});

export async function sendContactTemplateAction(contactId: string, formData: FormData) {
  const ctx = await requireTenantContext();
  const input = sendContactTemplateSchema.parse({
    conversationId: formData.get("conversationId"),
    template: formData.get("template"),
  });

  const separator = input.template.lastIndexOf("|");
  await sendTemplate(ctx, {
    conversationId: input.conversationId,
    templateName: input.template.slice(0, separator),
    language: input.template.slice(separator + 1),
  });
  revalidatePath(`/contacts/${contactId}`);
}
