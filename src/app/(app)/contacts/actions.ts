"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext, requireTenantAdmin } from "@/modules/tenancy/context";
import { writeAuditLog } from "@/modules/tenancy/audit";
import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";
import { DEFAULT_COUNTRY } from "@/lib/phone";
import {
  createContact,
  updateContact,
  createTag,
  addTagToContact,
  removeTagFromContact,
  getContactByPhone,
} from "@/modules/crm/contacts";
import { createActivity } from "@/modules/crm/activities";
import { sendText, sendTemplate } from "@/modules/whatsapp/send";
import { checkPlanLimit } from "@/modules/tenancy/limits";
import { RecordDeleteError, deleteContactRecord } from "@/modules/crm/deletion";

// The contact forms are useActionState-shaped (PLAN.md §10 1R #6): a
// validation failure comes back as state the form renders next to the field
// that caused it, instead of throwing into Next's generic error page. The
// state carries an error *key*, not copy — the client resolves it through
// next-intl so nothing user-facing is hardcoded here (§1.2 Spanish-only).
export type ContactField = "name" | "phone" | "email" | "notes";

export type ContactFormState = {
  error: string | null;
  field: ContactField | null;
  /** Lets the edit form acknowledge a save; unused by the create form,
   * which shows its result as the new row in the list above it. */
  saved: boolean;
  /** What was submitted, echoed back. React resets an uncontrolled form
   * once its action resolves, so without this a rejected submit would hand
   * the user a blank form to retype — the opposite of the point. The client
   * feeds these back in as defaultValue. */
  values: Record<string, string>;
};

/** Zod path → the message key the form shows under that input. */
const CONTACT_FIELD_ERRORS: Record<ContactField, string> = {
  name: "nameRequired",
  phone: "phoneRequired",
  email: "emailInvalid",
  notes: "notesTooLong",
};

/** Every string entry of the submission, for the echo-back above. */
function submitted(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function contactIssue(error: z.ZodError, formData: FormData): ContactFormState {
  const values = submitted(formData);
  const field = error.issues[0]?.path[0];
  if (typeof field === "string" && field in CONTACT_FIELD_ERRORS) {
    const key = field as ContactField;
    return { error: CONTACT_FIELD_ERRORS[key], field: key, saved: false, values };
  }
  return { error: "unknown", field: null, saved: false, values };
}

const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(20),
  email: z.string().email().optional().or(z.literal("")),
  source: z.string().max(100).optional().or(z.literal("")),
});

export async function createContactAction(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const ctx = await requireTenantContext();
  const parsed = createContactSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email") || undefined,
    source: formData.get("source") || undefined,
  });
  if (!parsed.success) return contactIssue(parsed.error, formData);

  const tenant = await getTenant(ctx.tenantId);
  const tenantSettings = (tenant?.settings ?? {}) as TenantSettings;
  const country = tenantSettings.defaultCountry ?? DEFAULT_COUNTRY;

  // Phone is the tenant-unique identity of a contact (§5), so a repeat is
  // the most likely way this form fails for a real user. The lookup
  // normalizes too — "0981 123 456" and "+595981123456" are the same
  // contact — so this answers inline rather than letting the unique index
  // raise a 500.
  const existing = await getContactByPhone(ctx, parsed.data.phone, country);
  if (existing) {
    return { error: "phoneTaken", field: "phone", saved: false, values: submitted(formData) };
  }

  // The plan's contact ceiling, if it has one (PLAN.md §13 H6). Checked
  // before the insert so the tenant is told why rather than hitting a
  // half-created state.
  const limit = await checkPlanLimit(ctx.tenantId, "maxContacts");
  if (!limit.allowed) {
    return { error: "planLimit", field: null, saved: false, values: submitted(formData) };
  }

  try {
    await createContact(ctx, parsed.data, country);
  } catch {
    // Anything left (a lost race on the unique index, a dead connection)
    // is still not worth an error page mid-form.
    return { error: "unknown", field: null, saved: false, values: submitted(formData) };
  }

  revalidatePath("/contacts");
  // Cleared on success: the contact is now a row in the list above, and the
  // form is ready for the next one.
  return { error: null, field: null, saved: true, values: {} };
}

const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().max(5000).optional(),
});

export async function updateContactAction(
  contactId: string,
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const ctx = await requireTenantContext();
  const parsed = updateContactSchema.safeParse({
    name: formData.get("name") || undefined,
    email: formData.get("email") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return contactIssue(parsed.error, formData);

  try {
    await updateContact(ctx, contactId, parsed.data);
  } catch {
    return { error: "unknown", field: null, saved: false, values: submitted(formData) };
  }

  revalidatePath(`/contacts/${contactId}`);
  // Saved values stay in the boxes — this form edits a record in place.
  return { error: null, field: null, saved: true, values: submitted(formData) };
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

// Deleting a contact created by mistake (see modules/crm/deletion.ts for why
// this is narrow). Admin-only and audited, like the other destructive
// actions in §13 H1 — and the refusal travels back in the URL exactly as
// deleteStageAction's does, since "it still has quotes" is what the admin
// needs to read and is not secret.
export async function deleteContactAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = z.string().min(1).max(26).safeParse(formData.get("contactId"));
  if (!parsed.success) return;
  const contactId = parsed.data;

  try {
    await deleteContactRecord(ctx, contactId);
  } catch (err) {
    if (err instanceof RecordDeleteError) {
      if (err.code === "notFound") redirect("/contacts");
      redirect(`/contacts/${contactId}?tab=datos&deleteError=${err.blockers.join(",")}`);
    }
    throw err;
  }

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    impersonatorUserId: ctx.impersonatorUserId,
    action: "contact.deleted",
    entity: "contact",
    entityId: contactId,
  });

  revalidatePath("/contacts");
  redirect("/contacts");
}
