import { eq } from "drizzle-orm";
import { sites } from "@/db/schema";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { encrypt, decrypt, type EncryptedPayload } from "@/lib/crypto";
import { getSite } from "./sites";

// Per-site configuration (PLAN.md §5.2). Lives in the existing `settings`
// JSON column rather than new columns, for the same reason tenant settings
// do: this is site *configuration*, not site data, and it ships without a
// migration. Anything a query has to filter or join on gets a real column.

/**
 * Cloudflare Turnstile credentials for one site.
 *
 * `siteKey` is public by design — it is rendered into the widget in page
 * source. `secret` is the half that must never reach a browser, so it is
 * encrypted at rest with AES-256-GCM (§3.4), exactly like a WhatsApp token.
 */
export type SiteTurnstileSettings = {
  siteKey: string;
  secret: EncryptedPayload;
  /**
   * Whether the keyed server-to-server ingest lane *requires* a token.
   * Default (absent) is false: a site's own backend already authenticates
   * with its API key, and most such handlers have no widget to get a token
   * from. Turning it on is for sites that do render the widget and want the
   * challenge enforced end to end.
   */
  requireOnIngest?: boolean;
};

export type SiteSettings = {
  turnstile?: SiteTurnstileSettings;
};

export function siteSettings(site: { settings: unknown }): SiteSettings {
  return (site.settings ?? {}) as SiteSettings;
}

/** Public half of the config — safe to render, may be null. */
export function siteTurnstileSiteKey(site: { settings: unknown }): string | null {
  return siteSettings(site).turnstile?.siteKey ?? null;
}

/**
 * Decrypts the site's Turnstile secret. Returns null when the site has no
 * Turnstile configured — the case every existing site is in, and the reason
 * §5.2's second lane is additive: no config means no verification step.
 */
export function siteTurnstileSecret(site: { settings: unknown }): string | null {
  const configured = siteSettings(site).turnstile;
  if (!configured) return null;
  try {
    return decrypt(configured.secret);
  } catch {
    // A secret that no longer decrypts (rotated APP_ENCRYPTION_KEY) must not
    // take the site's lead capture down with it; it degrades to "no
    // Turnstile" and the admin re-saves it.
    return null;
  }
}

export async function mergeSiteSettings(
  ctx: TenantContext,
  siteId: string,
  patch: SiteSettings,
): Promise<void> {
  const site = await getSite(ctx, siteId);
  if (!site) throw new Error("Sitio no encontrado");

  const merged: SiteSettings = { ...siteSettings(site), ...patch };
  await tenantDb(ctx).update(sites).set({ settings: merged }).where(eq(sites.id, siteId));
}

export type SetSiteTurnstileInput = {
  siteKey: string;
  /** Plaintext secret as pasted from the Cloudflare dashboard. */
  secret: string;
  requireOnIngest?: boolean;
};

export async function setSiteTurnstile(
  ctx: TenantContext,
  siteId: string,
  input: SetSiteTurnstileInput,
): Promise<void> {
  await mergeSiteSettings(ctx, siteId, {
    turnstile: {
      siteKey: input.siteKey,
      secret: encrypt(input.secret),
      requireOnIngest: input.requireOnIngest ?? false,
    },
  });
}

export async function clearSiteTurnstile(ctx: TenantContext, siteId: string): Promise<void> {
  const site = await getSite(ctx, siteId);
  if (!site) return;
  const next = { ...siteSettings(site) };
  delete next.turnstile;
  await tenantDb(ctx).update(sites).set({ settings: next }).where(eq(sites.id, siteId));
}
