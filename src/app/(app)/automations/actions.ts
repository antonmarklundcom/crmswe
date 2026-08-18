"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import { createFlow, saveDraft, publishFlow, setFlowStatus } from "@/modules/automations/flows";
import { cancelRun } from "@/modules/automations/engine";
import { flowGraphSchema, TRIGGER_TYPES } from "@/modules/automations/graph";

// Automations are tenant *configuration*, reserved for `admin` by §3.2 — an
// agent works contacts/deals/inbox/quotes but does not author the flows that
// send on the tenant's WhatsApp number. Every action here therefore goes
// through requireTenantAdmin(); /automations is nav-hidden and page-guarded
// for agents on top of that, but this is the check that actually holds.

const createFlowSchema = z.object({
  name: z.string().min(1).max(200),
  triggerType: z.enum(TRIGGER_TYPES),
});

// useActionState-shaped (PLAN.md §10 1R #6): a missing name comes back
// inline instead of throwing. The trigger select is always populated from
// TRIGGER_TYPES, so it can't realistically fail once submitted from this
// form — a failure there lands in the form-level slot.
export type FlowField = "name";

export type FlowFormState = {
  error: string | null;
  field: FlowField | null;
  values: Record<string, string>;
};

export async function createFlowAction(
  _prevState: FlowFormState,
  formData: FormData,
): Promise<FlowFormState> {
  const ctx = await requireTenantAdmin();
  const values = Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const parsed = createFlowSchema.safeParse({
    name: formData.get("name"),
    triggerType: formData.get("triggerType"),
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "name") {
      return { error: "nameRequired", field: "name", values };
    }
    return { error: "unknown", field: null, values };
  }

  let flow;
  try {
    flow = await createFlow(ctx, parsed.data);
  } catch {
    return { error: "unknown", field: null, values };
  }

  revalidatePath("/automations");
  redirect(`/automations/${flow!.id}`);
}

/** Called from the editor with the canvas graph as JSON. */
export async function saveDraftAction(flowId: string, graphJson: string) {
  const ctx = await requireTenantAdmin();
  const graph = flowGraphSchema.parse(JSON.parse(graphJson));
  await saveDraft(ctx, flowId, graph);
  revalidatePath(`/automations/${flowId}`);
}

export async function publishFlowAction(flowId: string) {
  const ctx = await requireTenantAdmin();
  const result = await publishFlow(ctx, flowId);
  revalidatePath(`/automations/${flowId}`);
  // Validation errors are shown in the editor, so they're returned rather
  // than thrown — a failed publish is an expected outcome, not a crash.
  return result.ok ? { ok: true as const } : { ok: false as const, errors: result.errors };
}

export async function setFlowStatusAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = z
    .object({ flowId: z.string().min(1), status: z.enum(["draft", "active", "paused"]) })
    .safeParse({ flowId: formData.get("flowId"), status: formData.get("status") });
  if (!parsed.success) return;
  await setFlowStatus(ctx, parsed.data.flowId, parsed.data.status);
  revalidatePath(`/automations/${parsed.data.flowId}`);
}

export async function cancelRunAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = z
    .object({ runId: z.string().min(1), flowId: z.string().min(1) })
    .safeParse({ runId: formData.get("runId"), flowId: formData.get("flowId") });
  if (!parsed.success) return;
  await cancelRun(ctx, parsed.data.runId);
  revalidatePath(`/automations/${parsed.data.flowId}`);
}
