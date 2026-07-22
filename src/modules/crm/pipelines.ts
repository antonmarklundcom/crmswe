import { eq } from "drizzle-orm";
import { pipelines, stages } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Pipelines/stages config (PLAN.md §4, §5). Multiple pipelines per tenant;
// a default pipeline is seeded at tenant creation (called from the
// superadmin tenant-creation action, not from modules/tenancy — crm stays
// downstream of tenancy, not the other way around).

const DEFAULT_STAGES: Array<{ name: string; isWon?: boolean; isLost?: boolean }> = [
  { name: "Nuevo" },
  { name: "Contactado" },
  { name: "Propuesta" },
  { name: "Ganado", isWon: true },
  { name: "Perdido", isLost: true },
];

export async function seedDefaultPipeline(ctx: TenantContext) {
  const pipelineId = newId();
  await tenantDb(ctx).insert(pipelines).values({ id: pipelineId, name: "Ventas", position: 0 });

  for (const [index, stage] of DEFAULT_STAGES.entries()) {
    await tenantDb(ctx)
      .insert(stages)
      .values({
        id: newId(),
        pipelineId,
        name: stage.name,
        position: index,
        isWon: stage.isWon ?? false,
        isLost: stage.isLost ?? false,
      });
  }

  return getPipeline(ctx, pipelineId);
}

export type CreatePipelineInput = { name: string; position?: number };

export async function createPipeline(ctx: TenantContext, input: CreatePipelineInput) {
  const id = newId();
  await tenantDb(ctx)
    .insert(pipelines)
    .values({ id, name: input.name, position: input.position ?? 0 });
  return getPipeline(ctx, id);
}

export async function getPipeline(ctx: TenantContext, id: string) {
  const [row] = await tenantDb(ctx).select(pipelines, eq(pipelines.id, id));
  return row ?? null;
}

export function listPipelines(ctx: TenantContext) {
  return tenantDb(ctx)
    .select(pipelines)
    .then((rows) => rows.sort((a, b) => a.position - b.position));
}

export type CreateStageInput = {
  pipelineId: string;
  name: string;
  position?: number;
  color?: string;
  isWon?: boolean;
  isLost?: boolean;
};

export async function createStage(ctx: TenantContext, input: CreateStageInput) {
  const id = newId();
  await tenantDb(ctx)
    .insert(stages)
    .values({
      id,
      pipelineId: input.pipelineId,
      name: input.name,
      position: input.position ?? 0,
      color: input.color,
      isWon: input.isWon ?? false,
      isLost: input.isLost ?? false,
    });
  const [row] = await tenantDb(ctx).select(stages, eq(stages.id, id));
  return row ?? null;
}

export async function listStagesForPipeline(ctx: TenantContext, pipelineId: string) {
  const rows = await tenantDb(ctx).select(stages, eq(stages.pipelineId, pipelineId));
  return rows.sort((a, b) => a.position - b.position);
}

export async function getStage(ctx: TenantContext, id: string) {
  const [row] = await tenantDb(ctx).select(stages, eq(stages.id, id));
  return row ?? null;
}
