"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/modules/tenancy/context";
import { createForm } from "@/modules/forms/forms";
import type { FormField } from "@/modules/forms/forms";

// Standard field set (PLAN.md §4 "forms" allows text/phone/email/select/
// textarea; the tenant-side field-order/type editor is left for a later
// pass — nombre/teléfono/correo covers the lead-capture case this product
// is sold on, and submissions.ts already resolves contacts by any "phone"
// typed field, not a hardcoded key).
const STANDARD_FIELDS: FormField[] = [
  { key: "nombre", label: "Nombre", type: "text", required: true },
  { key: "phone", label: "Teléfono", type: "phone", required: true },
  { key: "email", label: "Correo", type: "email", required: false },
];

const createFormSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  targetPipelineId: z.string().optional().or(z.literal("")),
  targetStageId: z.string().optional().or(z.literal("")),
});

// useActionState-shaped (PLAN.md §10 1R #6): a missing name or a slug with
// spaces/uppercase comes back inline instead of throwing to Next's error
// page. Named FormCreateField, not FormField, to avoid clashing with the
// lead-capture field type already exported from @/modules/forms/forms.
export type FormCreateField = "name" | "slug";

export type FormFormState = {
  error: string | null;
  field: FormCreateField | null;
  values: Record<string, string>;
};

const FORM_FIELD_ERRORS: Record<FormCreateField, string> = {
  name: "nameRequired",
  slug: "slugInvalid",
};

export async function createFormAction(
  _prevState: FormFormState,
  formData: FormData,
): Promise<FormFormState> {
  const ctx = await requireTenantContext();
  const values = Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const parsed = createFormSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    targetPipelineId: formData.get("targetPipelineId") || undefined,
    targetStageId: formData.get("targetStageId") || undefined,
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (typeof field === "string" && field in FORM_FIELD_ERRORS) {
      const key = field as FormCreateField;
      return { error: FORM_FIELD_ERRORS[key], field: key, values };
    }
    return { error: "unknown", field: null, values };
  }

  try {
    await createForm(ctx, {
      name: parsed.data.name,
      slug: parsed.data.slug,
      fields: STANDARD_FIELDS,
      settings: {
        targetPipelineId: parsed.data.targetPipelineId || undefined,
        targetStageId: parsed.data.targetStageId || undefined,
      },
    });
  } catch {
    return { error: "unknown", field: null, values };
  }

  revalidatePath("/forms");
  return { error: null, field: null, values: {} };
}
