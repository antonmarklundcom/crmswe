import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { siteHookCaptures, sites } from "@/db/schema";
import { newId } from "@/lib/ids";
import { listLeafPaths, resolveString, type LeafPath } from "@/lib/object-path";
import type { TenantContext } from "@/modules/tenancy/context";
import { buildSystemTenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { ingestLeadForSite, type IngestOutcome, type SiteRow } from "./ingest";
import { mergeSiteSettings, siteSettings } from "./settings";
import { recordIngestFailure } from "./health";

// Inbound webhook lane (PLAN.md §5.2) — the second ingest lane, for client
// sites on Elementor, Wix, Webflow and Zapier/Make that cannot hold a
// server-side secret.
//
// This file is a TRANSLATION LAYER, not a second ingest. It resolves a token
// to a site, maps an arbitrary JSON payload onto the CRM's fields, and hands
// the result to ingestLeadForSite() — the same engine the keyed lane uses,
// with the same per-site routing read from the same site record.

const TOKEN_PREFIX = "vc_hook_";

export type GeneratedHookToken = {
  /** Shown exactly once, like an API key (§5.1). */
  plaintext: string;
  hash: string;
  displayPrefix: string;
};

export function generateHookToken(): GeneratedHookToken {
  // 32 bytes, same as an API key: the token is the entire credential, and it
  // has to survive being pasted into somebody else's webhook field.
  const plaintext = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    plaintext,
    hash: hashHookToken(plaintext),
    displayPrefix: plaintext.slice(0, 16),
  };
}

export function hashHookToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Token → site → tenant. Runs before any TenantContext can exist — the same
 * pre-context platform lookup as the API key (§5.1) and the WhatsApp
 * webhook's phone_number_id (§6.3), covered by the same §3.3 exemption.
 */
export async function resolveSiteByHookToken(plaintext: string): Promise<SiteRow | null> {
  if (!plaintext.startsWith(TOKEN_PREFIX)) return null;

  const hash = hashHookToken(plaintext);
  const [site] = await db.select().from(sites).where(eq(sites.hookTokenHash, hash));
  if (!site?.hookTokenHash) return null;

  const a = Buffer.from(site.hookTokenHash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return site;
}

const LAST_USED_THROTTLE_MS = 60_000;

/** Same throttled, best-effort bookkeeping as the API keys' last_used_at. */
async function touchHookToken(site: SiteRow): Promise<void> {
  const now = Date.now();
  if (site.hookTokenLastUsedAt && now - site.hookTokenLastUsedAt.getTime() < LAST_USED_THROTTLE_MS) {
    return;
  }
  try {
    await db
      .update(sites)
      .set({ hookTokenLastUsedAt: new Date(now) })
      .where(eq(sites.id, site.id));
  } catch {
    // Never cost a lead over a timestamp.
  }
}

/** Issues (or replaces) a site's webhook token. Revocation is `revokeHookToken`,
 * independent of the site's API keys — that separation is the point of the
 * token being its own credential. */
export async function issueHookToken(ctx: TenantContext, siteId: string): Promise<string> {
  const token = generateHookToken();
  await tenantDb(ctx)
    .update(sites)
    .set({ hookTokenHash: token.hash, hookTokenPrefix: token.displayPrefix, hookTokenLastUsedAt: null })
    .where(eq(sites.id, siteId));
  return token.plaintext;
}

export async function revokeHookToken(ctx: TenantContext, siteId: string): Promise<void> {
  await tenantDb(ctx)
    .update(sites)
    .set({ hookTokenHash: null, hookTokenPrefix: null, hookTokenLastUsedAt: null })
    .where(eq(sites.id, siteId));
}

/**
 * Per-site field mapping: dot/bracket paths into whatever JSON the builder
 * sends. `phone` is the only one that matters structurally — it is contact
 * identity (§5) — but all four are optional here so a half-built mapping
 * fails with "phone not found" rather than a type error.
 */
export type SiteHookMapping = {
  phone?: string;
  name?: string;
  email?: string;
  message?: string;
};

export function siteHookMapping(site: { settings: unknown }): SiteHookMapping | null {
  const mapping = siteSettings(site).hookMapping;
  // A mapping with no phone path is not a mapping: capture mode stays on.
  return mapping?.phone ? mapping : null;
}

export async function setSiteHookMapping(
  ctx: TenantContext,
  siteId: string,
  mapping: SiteHookMapping,
): Promise<void> {
  await mergeSiteSettings(ctx, siteId, { hookMapping: mapping });
}

/** How many raw payloads capture mode keeps per site. Enough to compare a
 * couple of test submissions, small enough that nobody accumulates a data
 * pile they didn't ask for. */
export const MAX_CAPTURES_PER_SITE = 5;

export function listHookCaptures(ctx: TenantContext, siteId: string) {
  return tenantDb(ctx)
    .select(siteHookCaptures, eq(siteHookCaptures.siteId, siteId))
    .then((rows) => rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
}

/** Field paths offered to the admin, built from the newest captured payload
 * (§5.2 capture mode). This is what lets a non-developer pick
 * `fields.telefono.value` from a list instead of typing it from memory. */
export function captureLeafPaths(capture: { payload: unknown } | undefined): LeafPath[] {
  if (!capture) return [];
  return listLeafPaths(capture.payload);
}

export async function clearHookCaptures(ctx: TenantContext, siteId: string): Promise<void> {
  await tenantDb(ctx).delete(siteHookCaptures, eq(siteHookCaptures.siteId, siteId));
}

async function storeCapture(
  site: SiteRow,
  payload: unknown,
  contentType: string | undefined,
): Promise<void> {
  const ctx = await buildSystemTenantContext(site.tenantId);
  if (!ctx) return;

  await tenantDb(ctx).insert(siteHookCaptures).values({
    id: newId(),
    siteId: site.id,
    payload: (payload ?? {}) as object,
    contentType,
  });

  // Keep the newest MAX_CAPTURES_PER_SITE. Trimming here rather than on a
  // schedule keeps the cap honest without a job.
  const existing = await db
    .select({ id: siteHookCaptures.id })
    .from(siteHookCaptures)
    .where(eq(siteHookCaptures.siteId, site.id))
    .orderBy(desc(siteHookCaptures.createdAt));

  for (const row of existing.slice(MAX_CAPTURES_PER_SITE)) {
    await tenantDb(ctx).delete(siteHookCaptures, eq(siteHookCaptures.id, row.id));
  }
}

/**
 * Time bucket for the derived idempotency key. Callers on this lane never
 * send one — Elementor has no field for it — so it is derived from
 * site + phone + bucket.
 *
 * 10 minutes is the trade-off, stated plainly: a double-submitted form (the
 * common case — impatient visitor, Zapier retry, Make re-run) collapses into
 * one lead, while a genuinely new enquiry from the same number inside the
 * same 10 minutes would be swallowed. That second case is rare and its cost
 * is a missing duplicate row on a timeline that already has the contact;
 * the first is frequent and its cost is a duplicate contact and a duplicate
 * deal in the owner's kanban.
 */
export const IDEMPOTENCY_BUCKET_MS = 10 * 60_000;

export function deriveIdempotencyKey(siteId: string, phone: string, now = Date.now()): string {
  // Digits only, so "0981 123-456" and "0981123456" collapse to the same key
  // before normalization ever runs.
  const digits = phone.replace(/\D/g, "");
  const bucket = Math.floor(now / IDEMPOTENCY_BUCKET_MS);
  const hash = createHash("sha256").update(`${siteId}:${digits}:${bucket}`).digest("hex");
  return `hook_${hash.slice(0, 40)}`;
}

export type HookOutcome =
  | { ok: true; result: IngestOutcome & { ok: true } }
  | { ok: false; status: 401 | 403 | 404 | 422 | 429; error: string }
  /** Capture mode: nothing was written to the CRM, the payload was stored so
   * the admin can build a mapping against the real shape. */
  | { ok: false; status: 202; captured: true };

export type HookRequestMeta = {
  ipAddress?: string;
  userAgent?: string;
  contentType?: string;
  pageUrl?: string;
};

/**
 * The receiver. Resolves the token, decides capture-vs-map, and delegates the
 * actual write to the shared engine.
 */
export async function receiveHookPayload(
  token: string | null,
  payload: unknown,
  meta: HookRequestMeta = {},
): Promise<HookOutcome> {
  if (!token) return { ok: false, status: 404, error: "Unknown webhook" };

  const site = await resolveSiteByHookToken(token);
  // 404, not 401: an unknown token should look like an unknown URL, since
  // that is all the caller can tell from a path segment anyway.
  if (!site) return { ok: false, status: 404, error: "Unknown webhook" };
  if (!site.isActive) return { ok: false, status: 403, error: "Site is inactive" };

  await touchHookToken(site);

  const mapping = siteHookMapping(site);
  if (!mapping) {
    // Capture mode (§5.2). The site owner sends one test submission and then
    // builds the mapping against the shape that actually arrived. 202, not
    // an error: the caller's webhook is configured correctly and telling
    // Elementor otherwise would have the client "fixing" a working setup.
    await storeCapture(site, payload, meta.contentType);
    return { ok: false, status: 202, captured: true };
  }

  const phone = resolveString(payload, mapping.phone);
  if (!phone) {
    // The most valuable broken-client signal there is: the webhook is live,
    // the payload arrives, and the mapping no longer matches it (the client
    // renamed a field, or added a step). Recorded here because it is decided
    // before the shared engine runs — see modules/sites/health.ts.
    await recordIngestFailure(site, "hook", 422, "phone-missing");
    return { ok: false, status: 422, error: "No phone value at the configured path" };
  }

  const body = {
    phone,
    name: resolveString(payload, mapping.name),
    email: resolveString(payload, mapping.email),
    message: resolveString(payload, mapping.message),
    source: `hook:${site.slug}`,
    page_url: meta.pageUrl,
    // Callers on this lane can't send one, so it is derived (see above).
    idempotency_key: deriveIdempotencyKey(site.id, phone),
    // Everything unmapped is kept verbatim, so nothing the client's form
    // collected is lost just because the mapping doesn't name it yet.
    fields: toFieldsObject(payload),
  };

  const outcome = await ingestLeadForSite(site, body, meta, "hook");
  if (!outcome.ok) return outcome;
  return { ok: true, result: outcome };
}

/** The whole payload, preserved on the submission (§5.2: "everything
 * unmapped goes into the submission's fields object so nothing is lost").
 * Non-object payloads are wrapped rather than dropped. */
function toFieldsObject(payload: unknown): Record<string, unknown> {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return { value: payload };
}
