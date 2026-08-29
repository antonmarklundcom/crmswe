import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";
import type { TenantContext } from "@/modules/tenancy/context";

// Whether this tenant has a WhatsApp channel at all (plan.md §1.7, §5.3.1).
//
// The Swedish edition is e-post-first, so the answer is no unless a tenant
// says otherwise. That is a *product* decision, not a deletion: vendercrm and
// this fork trade cherry-picks in both directions (plan.md §1.1), so
// modules/whatsapp stays intact and fully working behind this one flag.
//
// Everything that hides a WhatsApp surface reads it from here rather than
// reaching into `settings` itself, so "what does off mean" has one answer and
// turning it back on is one write — not a hunt through nine files.

/**
 * The predicate itself, over an already-loaded settings blob.
 *
 * Absent reads as **off**. That matters for more than new tenants: every
 * tenant row written before this field existed — including the inherited
 * vendercrm ones — has no key here, and the Swedish product must hide
 * WhatsApp for them too. Only an explicit `true` turns it on.
 */
export function isWhatsappEnabled(settings: TenantSettings | null | undefined): boolean {
  return settings?.whatsappEnabled === true;
}

/**
 * The same question when all you hold is a context. One primary-key lookup;
 * the pages that call it are already server-rendering a full screen, so it is
 * not worth threading onto TenantContext the way `currency` is (that one is
 * read on every priced row, this one once per render).
 */
export async function whatsappEnabledFor(ctx: TenantContext): Promise<boolean> {
  const tenant = await getTenant(ctx.tenantId);
  return isWhatsappEnabled(tenant?.settings as TenantSettings | null);
}

/**
 * Same question for a tenant id with no context behind it — the WhatsApp
 * webhook, which resolves its tenant from Meta's payload long before any
 * context could exist.
 */
export async function whatsappEnabledForTenantId(tenantId: string): Promise<boolean> {
  const tenant = await getTenant(tenantId);
  return isWhatsappEnabled(tenant?.settings as TenantSettings | null);
}
