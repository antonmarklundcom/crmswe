"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import { createSite, updateSite, rotateApiKey, getSiteBySlug } from "@/modules/sites/sites";
import { setSiteTurnstile, clearSiteTurnstile } from "@/modules/sites/settings";
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
    .regex(/^[a-z0-9-]+$/),
  domain: z.string().max(255).optional().or(z.literal("")),
  defaultStageId: z.string().optional().or(z.literal("")),
  waAccountId: z.string().optional().or(z.literal("")),
});

// useActionState-shaped (PLAN.md §10 1R #6): a missing name or a bad slug
// comes back inline instead of throwing to Next's error page. The one-time
// API key still comes back the same way it always did — through state —
// since it's never persisted in plaintext (§5.1).
export type SiteField = "name" | "slug";

export type CreateSiteFormState = {
  error: string | null;
  field: SiteField | null;
  values: Record<string, string>;
  apiKey: string | null;
};

const SITE_FIELD_ERRORS: Record<SiteField, string> = {
  name: "nameRequired",
  slug: "slugInvalid",
};

export async function createSiteAction(
  _prevState: CreateSiteFormState,
  formData: FormData,
): Promise<CreateSiteFormState> {
  const ctx = await requireTenantAdmin();
  const values = Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const parsed = createSiteSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    domain: formData.get("domain") || undefined,
    defaultStageId: formData.get("defaultStageId") || undefined,
    waAccountId: formData.get("waAccountId") || undefined,
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (typeof field === "string" && field in SITE_FIELD_ERRORS) {
      const key = field as SiteField;
      return { error: SITE_FIELD_ERRORS[key], field: key, values, apiKey: null };
    }
    return { error: "unknown", field: null, values, apiKey: null };
  }

  const existing = await getSiteBySlug(ctx, parsed.data.slug);
  if (existing) {
    return { error: "slugTaken", field: "slug", values, apiKey: null };
  }

  let created;
  try {
    created = await createSite(ctx, {
      name: parsed.data.name,
      slug: parsed.data.slug,
      domain: parsed.data.domain || undefined,
      defaultStageId: parsed.data.defaultStageId || undefined,
      defaultPipelineId: await pipelineForStage(ctx, parsed.data.defaultStageId || undefined),
      waAccountId: parsed.data.waAccountId || undefined,
    });
  } catch {
    // A lost race on the unique index is still not worth a 500 mid-form.
    return { error: "slugTaken", field: "slug", values, apiKey: null };
  }

  revalidatePath("/sites");
  return { error: null, field: null, values: {}, apiKey: created.apiKey };
}

export async function rotateApiKeyAction(_prev: string | null, formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = z.string().min(1).safeParse(formData.get("siteId"));
  if (!parsed.success) return null;
  const key = await rotateApiKey(ctx, parsed.data);
  revalidatePath("/sites");
  return key;
}

// Per-site Cloudflare Turnstile (PLAN.md §5.2). useActionState-shaped like
// every other user-fillable form (§10 1R #6) — but the secret is excluded
// from the echoed values, the same rule connectAccountAction follows for a
// WhatsApp token (§3.4): `values` is serialized to the browser.
export type TurnstileFormState = {
  error: string | null;
  saved: boolean;
  values: { turnstileSiteKey?: string };
};

const turnstileSchema = z.object({
  siteId: z.string().min(1),
  siteKey: z.string().min(1).max(200),
  secret: z.string().min(1).max(300),
  requireOnIngest: z.boolean(),
});

export async function saveSiteTurnstileAction(
  _prev: TurnstileFormState,
  formData: FormData,
): Promise<TurnstileFormState> {
  const ctx = await requireTenantAdmin();
  const siteKey = (formData.get("turnstileSiteKey") ?? "").toString().trim();

  const parsed = turnstileSchema.safeParse({
    siteId: formData.get("siteId"),
    siteKey,
    secret: (formData.get("turnstileSecret") ?? "").toString().trim(),
    requireOnIngest: formData.get("requireOnIngest") === "on",
  });

  if (!parsed.success) {
    return { error: "turnstileIncomplete", saved: false, values: { turnstileSiteKey: siteKey } };
  }

  await setSiteTurnstile(ctx, parsed.data.siteId, {
    siteKey: parsed.data.siteKey,
    secret: parsed.data.secret,
    requireOnIngest: parsed.data.requireOnIngest,
  });
  revalidatePath("/sites");
  return { error: null, saved: true, values: {} };
}

export async function clearSiteTurnstileAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = z.string().min(1).safeParse(formData.get("siteId"));
  if (!parsed.success) return;
  await clearSiteTurnstile(ctx, parsed.data);
  revalidatePath("/sites");
}

export async function toggleSiteActiveAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = z.string().min(1).safeParse(formData.get("siteId"));
  if (!parsed.success) return;
  const isActive = formData.get("isActive") === "true";
  await updateSite(ctx, parsed.data, { isActive });
  revalidatePath("/sites");
}

const routingSchema = z.object({
  siteId: z.string().min(1),
  defaultStageId: z.string().optional().or(z.literal("")),
  waAccountId: z.string().optional().or(z.literal("")),
});

export async function updateSiteRoutingAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = routingSchema.safeParse({
    siteId: formData.get("siteId"),
    defaultStageId: formData.get("defaultStageId") || undefined,
    waAccountId: formData.get("waAccountId") || undefined,
  });
  if (!parsed.success) return;

  await updateSite(ctx, parsed.data.siteId, {
    defaultStageId: parsed.data.defaultStageId || undefined,
    defaultPipelineId: await pipelineForStage(ctx, parsed.data.defaultStageId || undefined),
    waAccountId: parsed.data.waAccountId || undefined,
  });
  revalidatePath("/sites");
}
