import { eq } from "drizzle-orm";
import { forms } from "@/db/schema";
import { buildSystemTenantContext } from "@/modules/tenancy/context";
import { getTenantBySlug } from "@/modules/tenancy/tenants";
import { tenantDb } from "@/modules/tenancy/db";
import { normalizePhone } from "@/modules/crm/contacts";
import { recordLeadSubmission } from "@/modules/leads/submissions";
import { checkRateLimit } from "@/lib/rate-limit";
import type { FormSettings } from "./forms";

// Public form submission (PLAN.md §5). Unauthenticated by nature — the
// tenant is resolved from the URL slug, not from user input, then a system
// TenantContext is built from that resolved id (never a client-supplied
// tenantId).
//
// The CRM-side effects (contact upsert, deal, timeline, event) are shared
// with the ingest API via modules/leads (§5.1); this file only resolves the
// form and maps its fields.

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

// Per-IP fixed-window limit, form-scoped so one spammy form can't exhaust a
// shared visitor's budget on another (see lib/rate-limit for the shared
// implementation and its documented limitation).
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

export async function submitForm(
  tenantSlug: string,
  formSlug: string,
  input: SubmitFormInput,
) {
  const resolved = await getPublicForm(tenantSlug, formSlug);
  if (!resolved) throw new Error("Formulario no encontrado");
  const { tenant, form } = resolved;

  const rateKey = `form:${form.id}:${input.ipAddress ?? "unknown"}`;
  if (checkRateLimit(rateKey, RATE_LIMIT, RATE_WINDOW_MS).limited) {
    throw new Error("Demasiados envíos. Probá de nuevo en un momento.");
  }

  const ctx = await buildSystemTenantContext(tenant.id);
  if (!ctx) throw new Error("Formulario no encontrado");

  const fields = form.fields as Array<{ key: string; type: string }>;
  const valueOfType = (type: string) => {
    const field = fields.find((f) => f.type === type);
    return field ? input.data[field.key] : undefined;
  };

  const phone = valueOfType("phone");
  if (!phone) throw new Error("El teléfono es obligatorio");

  const nameField = fields.find((f) => f.key === "name" || f.key === "nombre");
  const name = nameField ? input.data[nameField.key] : undefined;

  const settings = form.settings as FormSettings;

  const result = await recordLeadSubmission(ctx, {
    formId: form.id,
    phone: normalizePhone(phone),
    name,
    email: valueOfType("email"),
    message: valueOfType("textarea"),
    source: `form:${form.slug}`,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    payload: input.data,
    defaults: {
      pipelineId: settings.targetPipelineId,
      stageId: settings.targetStageId,
      tagIds: settings.defaultTagIds ?? [],
      dealTitle: `${form.name} — ${name || phone}`,
    },
  });

  return {
    contactId: result.contactId,
    submissionId: result.submissionId,
    redirectUrl: settings.redirectUrl,
  };
}
