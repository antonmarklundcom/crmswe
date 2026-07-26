"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import { createSite, updateSite, rotateApiKey } from "@/modules/sites/sites";
import { getStage } from "@/modules/crm/pipelines";

// A stage already belongs to exactly one pipeline, so the UI only ever asks
// for the stage and the pipeline is derived here. Sending both from the
// client would let them drift out of sync.
async function pipelineForStage(
  ctx: Awaited<ReturnType<typeof requireTenantAdmin>>,
  stageId: string | undefined,
) {
  if (!stageId) return undefined;
  const stage = await getStage(ctx, stageId);
  return stage?.pipelineId;
}

// A freshly issued key is shown exactly once (§5.1). It's passed back to the
// page through a redirect param rather than stored anywhere — the hash is
// all the database ever holds.

const createSiteSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with dashes"),
  domain: z.string().max(255).optional().or(z.literal("")),
  defaultStageId: z.string().optional().or(z.literal("")),
  waAccountId: z.string().optional().or(z.literal("")),
});

// useActionState-shaped (prevState, formData) so the page can render the
// one-time key that comes back without ever persisting it.
export async function createSiteAction(_prev: string | null, formData: FormData) {
  const ctx = await requireTenantAdmin();
  const input = createSiteSchema.parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    domain: formData.get("domain") || undefined,
    defaultStageId: formData.get("defaultStageId") || undefined,
    waAccountId: formData.get("waAccountId") || undefined,
  });

  const created = await createSite(ctx, {
    name: input.name,
    slug: input.slug,
    domain: input.domain || undefined,
    defaultStageId: input.defaultStageId || undefined,
    defaultPipelineId: await pipelineForStage(ctx, input.defaultStageId || undefined),
    waAccountId: input.waAccountId || undefined,
  });

  revalidatePath("/sites");
  return created.apiKey;
}

export async function rotateApiKeyAction(_prev: string | null, formData: FormData) {
  const ctx = await requireTenantAdmin();
  const siteId = z.string().min(1).parse(formData.get("siteId"));
  const key = await rotateApiKey(ctx, siteId);
  revalidatePath("/sites");
  return key;
}

export async function toggleSiteActiveAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const siteId = z.string().min(1).parse(formData.get("siteId"));
  const isActive = formData.get("isActive") === "true";
  await updateSite(ctx, siteId, { isActive });
  revalidatePath("/sites");
}

const routingSchema = z.object({
  siteId: z.string().min(1),
  defaultStageId: z.string().optional().or(z.literal("")),
  waAccountId: z.string().optional().or(z.literal("")),
});

export async function updateSiteRoutingAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const input = routingSchema.parse({
    siteId: formData.get("siteId"),
    defaultStageId: formData.get("defaultStageId") || undefined,
    waAccountId: formData.get("waAccountId") || undefined,
  });

  await updateSite(ctx, input.siteId, {
    defaultStageId: input.defaultStageId || undefined,
    defaultPipelineId: await pipelineForStage(ctx, input.defaultStageId || undefined),
    waAccountId: input.waAccountId || undefined,
  });
  revalidatePath("/sites");
}
