"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext, requireTenantAdmin } from "@/modules/tenancy/context";
import { moveDeal, createDeal } from "@/modules/crm/deals";
import { createPipelineWithDefaultStages } from "@/modules/crm/pipelines";

const moveDealSchema = z.object({
  dealId: z.string().min(1),
  toStageId: z.string().min(1),
  toPosition: z.number().int().min(0),
});

export async function moveDealAction(input: {
  dealId: string;
  toStageId: string;
  toPosition: number;
}) {
  const ctx = await requireTenantContext();
  const parsed = moveDealSchema.parse(input);
  await moveDeal(ctx, parsed.dealId, { toStageId: parsed.toStageId, toPosition: parsed.toPosition });
  revalidatePath("/pipeline");
}

// The create-deal form is useActionState-shaped (PLAN.md §10 1R #6): a bad
// value or a missing title comes back as state rendered next to the input,
// not as Next's generic error page. The state carries a message *key* that
// the client resolves through next-intl — no copy lives in this file.
export type DealField = "title" | "contactId" | "stageId" | "value";

export type DealFormState = {
  error: string | null;
  field: DealField | null;
  created: boolean;
  /** Echoed back so a rejected submit doesn't blank the form: React resets
   * an uncontrolled form once its action resolves, and the client feeds
   * these back in as defaultValue. */
  values: Record<string, string>;
};

const DEAL_FIELD_ERRORS: Record<DealField, string> = {
  title: "titleRequired",
  contactId: "contactRequired",
  stageId: "stageRequired",
  value: "valueInvalid",
};

const createDealSchema = z.object({
  contactId: z.string().min(1),
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  title: z.string().min(1).max(200),
  // Guaraníes are integer minor units (§2.3) — a "1.5" typed into the value
  // box is a user mistake with a message, not a server crash.
  value: z.coerce.number().int().min(0).optional(),
});

export async function createDealAction(
  _prevState: DealFormState,
  formData: FormData,
): Promise<DealFormState> {
  const ctx = await requireTenantContext();
  const parsed = createDealSchema.safeParse({
    contactId: formData.get("contactId"),
    pipelineId: formData.get("pipelineId"),
    stageId: formData.get("stageId"),
    title: formData.get("title"),
    value: formData.get("value") || undefined,
  });

  const values = Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (typeof field === "string" && field in DEAL_FIELD_ERRORS) {
      const key = field as DealField;
      return { error: DEAL_FIELD_ERRORS[key], field: key, created: false, values };
    }
    // pipelineId comes from a hidden input, so a failure there is not a
    // field the user can fix — it belongs in the form-level slot.
    return { error: "unknown", field: null, created: false, values };
  }

  try {
    await createDeal(ctx, parsed.data);
  } catch {
    return { error: "unknown", field: null, created: false, values };
  }

  revalidatePath("/pipeline");
  // Cleared on success: the deal is now a card on the board above.
  return { error: null, field: null, created: true, values: {} };
}

const createPipelineSchema = z.object({
  name: z.string().min(1).max(100),
});

// Pipeline *config* is admin-only (§3.2) — adding a pipeline reshapes how the
// whole tenant sells. Working the board is not: moveDealAction and
// createDealAction above stay agent-accessible, which is the daily job.
export async function createPipelineAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const input = createPipelineSchema.parse({ name: formData.get("name") });
  const pipeline = await createPipelineWithDefaultStages(ctx, input.name);
  revalidatePath("/pipeline");
  if (pipeline) redirect(`/pipeline?pipeline=${pipeline.id}`);
}
