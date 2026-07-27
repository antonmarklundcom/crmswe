import { and, eq } from "drizzle-orm";
import { flowVersions, flows } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { flowGraphSchema, validateGraph, type FlowGraph, type TriggerType } from "./graph";

// Flow CRUD + publishing (PLAN.md §7.1). Editing never mutates a published
// version: a draft version is created instead, and publishing stamps it.
// Runs pin to the version they started on (§4), so a live edit can't change
// a run already in flight.

export type CreateFlowInput = {
  name: string;
  triggerType: TriggerType;
  triggerConfig?: Record<string, unknown>;
};

export async function createFlow(ctx: TenantContext, input: CreateFlowInput) {
  const id = newId();
  await tenantDb(ctx)
    .insert(flows)
    .values({
      id,
      name: input.name,
      status: "draft",
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig ?? {},
    });
  return getFlow(ctx, id);
}

export async function getFlow(ctx: TenantContext, id: string) {
  const [row] = await tenantDb(ctx).select(flows, eq(flows.id, id));
  return row ?? null;
}

export async function listFlows(ctx: TenantContext) {
  const rows = await tenantDb(ctx).select(flows);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function listVersions(ctx: TenantContext, flowId: string) {
  const rows = await tenantDb(ctx).select(flowVersions, eq(flowVersions.flowId, flowId));
  return rows.sort((a, b) => b.version - a.version);
}

export async function getVersion(ctx: TenantContext, versionId: string) {
  const [row] = await tenantDb(ctx).select(flowVersions, eq(flowVersions.id, versionId));
  return row ?? null;
}

/** Latest draft (unpublished) version, or null if the flow has none. */
export async function getDraftVersion(ctx: TenantContext, flowId: string) {
  const versions = await listVersions(ctx, flowId);
  return versions.find((version) => version.publishedAt === null) ?? null;
}

/**
 * Saves the editor's graph. Always writes to a draft version — if the latest
 * version is already published, a new draft is started from this save.
 */
export async function saveDraft(ctx: TenantContext, flowId: string, graph: FlowGraph) {
  const parsed = flowGraphSchema.parse(graph);

  const existingDraft = await getDraftVersion(ctx, flowId);
  if (existingDraft) {
    await tenantDb(ctx)
      .update(flowVersions)
      .set({ graph: parsed })
      .where(eq(flowVersions.id, existingDraft.id));
    return getVersion(ctx, existingDraft.id);
  }

  const versions = await listVersions(ctx, flowId);
  const id = newId();
  await tenantDb(ctx)
    .insert(flowVersions)
    .values({
      id,
      flowId,
      version: (versions[0]?.version ?? 0) + 1,
      graph: parsed,
    });
  return getVersion(ctx, id);
}

export type PublishResult =
  | { ok: true; versionId: string }
  | { ok: false; errors: Array<{ code: string; message: string }> };

/**
 * Validates the draft and, if it passes, stamps it published and points the
 * flow at it. A flow with no valid published version is never matched by
 * the trigger dispatcher.
 */
export async function publishFlow(ctx: TenantContext, flowId: string): Promise<PublishResult> {
  const draft = await getDraftVersion(ctx, flowId);
  if (!draft) {
    return { ok: false, errors: [{ code: "no_draft", message: "No hay borrador para publicar" }] };
  }

  const parsed = flowGraphSchema.safeParse(draft.graph);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        code: "schema",
        message: `${issue.path.join(".")}: ${issue.message}`,
      })),
    };
  }

  const errors = validateGraph(parsed.data);
  if (errors.length > 0) return { ok: false, errors };

  await tenantDb(ctx)
    .update(flowVersions)
    .set({ publishedAt: new Date() })
    .where(eq(flowVersions.id, draft.id));

  await tenantDb(ctx)
    .update(flows)
    .set({ publishedVersionId: draft.id, status: "active" })
    .where(eq(flows.id, flowId));

  return { ok: true, versionId: draft.id };
}

export async function setFlowStatus(
  ctx: TenantContext,
  flowId: string,
  status: "draft" | "active" | "paused",
) {
  await tenantDb(ctx).update(flows).set({ status }).where(eq(flows.id, flowId));
  return getFlow(ctx, flowId);
}

/** Active, published flows for a trigger type — what the dispatcher matches. */
export async function listActiveFlowsForTrigger(ctx: TenantContext, triggerType: TriggerType) {
  const rows = await tenantDb(ctx).select(
    flows,
    and(eq(flows.triggerType, triggerType), eq(flows.status, "active")),
  );
  return rows.filter((row) => row.publishedVersionId !== null);
}
