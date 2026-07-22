import { eq } from "drizzle-orm";
import { formSubmissions, forms } from "@/db/schema";
import { newId } from "@/lib/ids";
import { buildSystemTenantContext } from "@/modules/tenancy/context";
import { getTenantBySlug } from "@/modules/tenancy/tenants";
import { tenantDb } from "@/modules/tenancy/db";
import { createContact, getContactByPhone, addTagToContact } from "@/modules/crm/contacts";
import { createDeal } from "@/modules/crm/deals";
import { createActivity } from "@/modules/crm/activities";
import type { FormSettings } from "./forms";
import { formsEvents } from "./events";

// Public form submission (PLAN.md §5): unauthenticated by nature — the
// tenant is resolved from the URL slug, not from user input, then a system
// TenantContext is built from that resolved id (never a client-supplied
// tenantId). Rate limiting + honeypot enforcement is 1G hardening scope
// (§10); this module is the submission→contact/deal wiring itself.

/** Resolves the public form for rendering `/f/[tenantSlug]/[formSlug]`. */
export async function getPublicForm(tenantSlug: string, formSlug: string) {
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return null;

  const ctx = await buildSystemTenantContext(tenant.id);
  if (!ctx) return null;

  const [form] = await tenantDb(ctx).select(forms, eq(forms.slug, formSlug));
  if (!form || !form.isActive) return null;

  return { tenant, form };
}

export type SubmitFormInput = {
  data: Record<string, string>;
  ipAddress?: string;
  userAgent?: string;
};

export async function submitForm(
  tenantSlug: string,
  formSlug: string,
  input: SubmitFormInput,
) {
  const resolved = await getPublicForm(tenantSlug, formSlug);
  if (!resolved) throw new Error("Formulario no encontrado");
  const { tenant, form } = resolved;

  const ctx = await buildSystemTenantContext(tenant.id);
  if (!ctx) throw new Error("Formulario no encontrado");

  const phoneField = (form.fields as Array<{ key: string; type: string }>).find(
    (f) => f.type === "phone",
  );
  const phone = phoneField ? input.data[phoneField.key] : undefined;
  if (!phone) throw new Error("El teléfono es obligatorio");

  const emailField = (form.fields as Array<{ key: string; type: string }>).find(
    (f) => f.type === "email",
  );
  const email = emailField ? input.data[emailField.key] : undefined;

  const nameField = (form.fields as Array<{ key: string; type: string }>).find(
    (f) => f.key === "name" || f.key === "nombre",
  );
  const name = (nameField ? input.data[nameField.key] : undefined) || phone;

  let contact = await getContactByPhone(ctx, phone);
  if (!contact) {
    contact = await createContact(ctx, { name, phone, email, source: `form:${form.slug}` });
  }
  if (!contact) throw new Error("No se pudo crear el contacto");

  const settings = form.settings as FormSettings;
  for (const tagId of settings.defaultTagIds ?? []) {
    await addTagToContact(ctx, contact.id, tagId);
  }

  if (settings.targetPipelineId && settings.targetStageId) {
    await createDeal(ctx, {
      contactId: contact.id,
      pipelineId: settings.targetPipelineId,
      stageId: settings.targetStageId,
      title: `${form.name} — ${contact.name}`,
    });
  }

  const submissionId = newId();
  await tenantDb(ctx)
    .insert(formSubmissions)
    .values({
      id: submissionId,
      formId: form.id,
      contactId: contact.id,
      data: input.data,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

  await createActivity(ctx, {
    contactId: contact.id,
    type: "form_submission",
    payload: { formId: form.id, formName: form.name, data: input.data },
  });

  await formsEvents.emit("form.submitted", {
    tenantId: tenant.id,
    formId: form.id,
    contactId: contact.id,
    submissionId,
  });

  return { contactId: contact.id, submissionId, redirectUrl: settings.redirectUrl };
}
