import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tenants } from "@/db/schema";
import type { CountryCode } from "@/lib/phone";
import {
  isValidBankgiro,
  isValidOrgNr,
  isValidPlusgiro,
  momsRegNrFromOrgNr,
  toTenDigits,
} from "@/lib/se/identity";
import type { TenantContext } from "./context";
import { assertTenantWritable } from "./db";
import { getTenant } from "./tenants";

// Tenant admin self-service settings (PLAN.md §5 "tenant settings: branding,
// business hours, timezone"). `tenants` is a platform table keyed by its
// own id, not a `tenant_id` column, so it can't go through tenantDb(ctx) —
// but writes are still scoped to `ctx.tenantId` (never a client-supplied
// id) and still honor the grace/locked write gate via assertTenantWritable.

export type DayHours = { start: string; end: string } | null;

export type BusinessHours = {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun: DayHours;
};

export type TenantBranding = {
  logoUrl?: string;
  primaryColor?: string;
};

/**
 * Read-only export feed (see modules/crm/export.ts). The token is the secret
 * — the same model as the public quote link `/q/[token]` (§8) — because
 * Google's servers fetch the URL for IMPORTDATA and cannot carry a session.
 * Kept in tenant settings rather than its own column so this ships without a
 * migration; rotating it is a settings write.
 */
export type TenantExports = {
  contactsToken?: string;
};

/**
 * AI auto-reply configuration (PLAN.md §10 1O). Lives in tenant settings for
 * the same reason the export token does — no migration, and it is tenant
 * *configuration* rather than tenant data. The defaults that matter are
 * applied in modules/ai (not here), so a tenant row written before 1O
 * behaves identically to one that has never touched this form: AI off, and
 * draft mode if it is ever turned on.
 */
export type TenantAiSettings = {
  /**
   * Lets the assistant offer bookable slots in the thread (plan-booking.md
   * §5.3). It can only *offer*: the customer's tap is what reserves, through
   * the same transaction the public page uses.
   */
  bookingEnabled?: boolean;
  enabled?: boolean;
  /** Falls back to the tenant name when unset. */
  businessName?: string;
  about?: string;
  tone?: string;
  hours?: string;
  /** Prices, delivery dates — whatever the model must never commit to. */
  neverPromise?: string;
  /** Draft-before-send switch. Absent means draft (§10 1O). */
  mode?: "draft" | "send";
  maxRepliesPerConversationPerDay?: number;
  maxRepliesPerTenantPerDay?: number;
  /** Inbound message equal to this permanently silences the bot for that contact. */
  handoffKeyword?: string;
};

/**
 * Who a customer sees an offert or faktura arriving from, and where their
 * reply goes (plan.md §5.3.2; sweden-business-apps §6).
 *
 * `fromEmail` is deliberately the awkward one. Mail is only trusted from a
 * domain that has published SPF and DKIM for the sender, so a tenant cannot
 * simply declare `fakturor@sitt-företag.se` and have it work — an unverified
 * sender lands in skräpposten or bounces outright. The default therefore
 * keeps the platform's own verified address and puts the tenant's *name* in
 * front of it, which is what the customer reads anyway, and routes replies to
 * the tenant with `replyTo`. `fromEmail` exists for the tenant who has gone
 * and verified their domain in Resend, and the settings screen says so.
 */
export type TenantEmailSettings = {
  /** Display name on the sender. Falls back to the tenant's name. */
  fromName?: string;
  /** Only for a domain verified in Resend — see above. */
  fromEmail?: string;
  /** Where a customer's reply lands. */
  replyTo?: string;
};

export type TenantSettings = {
  branding?: TenantBranding;
  businessHours?: BusinessHours;
  exports?: TenantExports;
  ai?: TenantAiSettings;
  /**
   * Default country for phone normalization (PLAN.md §10 1R #4). Lives here
   * for the same no-migration reason as `ai` — configuration, not tenant
   * data. Unset behaves exactly as before this field existed: Paraguay
   * (`lib/phone.ts`'s `DEFAULT_COUNTRY`).
   */
  defaultCountry?: CountryCode;
  /**
   * The one switch that decides whether this product has a WhatsApp channel
   * at all (plan.md §1.7, §5.3.1).
   *
   * The Swedish edition is e-post-first, so this is **off unless a tenant
   * turns it on**: `undefined` reads as off, which is what every tenant row
   * written before this field existed says. Off means the surfaces are not
   * merely hidden — `/inbox`, `/whatsapp` and the inbox API answer 404, the
   * webhook stops accepting that tenant's messages, and the nav, dashboard,
   * contact page and site forms lose their WhatsApp halves.
   *
   * The module underneath is untouched and fully working: this repo is a
   * fork of vendercrm and fixes are cherry-picked in both directions
   * (plan.md §1.1), so deleting the code would cost more than hiding it.
   * Flipping this back on is one write, and the flag-on path is tested
   * alongside the flag-off one for exactly that reason.
   */
  whatsappEnabled?: boolean;
  /** Per-tenant sender for customer-facing mail (plan.md §5.3.2). */
  email?: TenantEmailSettings;
  /**
   * Google review link for the `send_review_request` automation action
   * (PLAN.md §10 1R #5 — the GBP review-request half of §10 1P, built here
   * because it needs no Google API: it's a link). A tenant's Google Business
   * Profile "get more reviews" short link, e.g.
   * `https://g.page/r/.../review`.
   */
  reviewLink?: string;
  /**
   * The vertical preset this tenant picked in the onboarding wizard
   * (plan-booking.md §6.1). Bookkeeping only: nothing branches on it. It
   * exists so the wizard can say "ya aplicaste barbería" rather than
   * offering to apply it again, and so support can see what a tenant started
   * from. If anything ever reads this to change behaviour, presets have
   * become code paths and the whole design has been lost.
   */
  vertical?: string;
  /**
   * Where a customer should transfer a seña, as the business would write it
   * ("Banco Itaú, cta. 12345678, a nombre de ..."). Read by the booking
   * deposit-request notification (plan-booking.md §5.1); flattened to one
   * line before it goes into a WhatsApp template variable, which is why the
   * bank details belong here rather than in a multi-paragraph blob.
   */
  depositInstructions?: string;
  /**
   * Reply-to for every email `senderFor(ctx)` resolves (PLAN.md §15.1,
   * §15.8 P4) — where a customer's "reply" on a transactional or automated
   * email actually lands. Falls back to the tenant's first active admin's
   * own login email when unset, so the reply-to is never blank.
   */
  contactEmail?: string;
  /**
   * The owner's own WhatsApp number — their personal phone, not the
   * business's WABA number (PLAN.md §15.3 "Voice, Lane A", second half).
   * A voice note from this number asking what is pending gets the "Hoy"
   * list back instead of being treated as a customer message. Unset means
   * the coach half is simply off; nothing else changes.
   */
  coachPhone?: string;
};

export async function updateTenantBranding(ctx: TenantContext, branding: TenantBranding) {
  return mergeTenantSettings(ctx, { branding });
}

export async function updateTenantBusinessHours(ctx: TenantContext, businessHours: BusinessHours) {
  return mergeTenantSettings(ctx, { businessHours });
}

export async function updateTenantAiSettings(ctx: TenantContext, ai: TenantAiSettings) {
  return mergeTenantSettings(ctx, { ai });
}

export async function updateTenantDefaultCountry(ctx: TenantContext, defaultCountry: CountryCode) {
  return mergeTenantSettings(ctx, { defaultCountry });
}

export async function updateTenantReviewLink(ctx: TenantContext, reviewLink: string) {
  return mergeTenantSettings(ctx, { reviewLink });
}

export async function updateTenantWhatsappEnabled(ctx: TenantContext, whatsappEnabled: boolean) {
  return mergeTenantSettings(ctx, { whatsappEnabled });
}

export async function updateTenantEmailSettings(
  ctx: TenantContext,
  email: TenantEmailSettings,
) {
  return mergeTenantSettings(ctx, { email });
}

export async function updateTenantContactEmail(ctx: TenantContext, contactEmail: string) {
  return mergeTenantSettings(ctx, { contactEmail });
}

export async function updateTenantCoachPhone(ctx: TenantContext, coachPhone: string) {
  return mergeTenantSettings(ctx, { coachPhone });
}


export async function updateTenantTimezone(ctx: TenantContext, timezone: string) {
  assertTenantWritable(ctx);
  await db.update(tenants).set({ timezone }).where(eq(tenants.id, ctx.tenantId));
  return getTenant(ctx.tenantId);
}

/** The indexed lookup column's value. Same digest MySQL's own SHA2(x, 256)
 * produces, which is what migration 0026 backfilled existing tokens with. */
function contactsFeedTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Företagsuppgifter — the seller block every faktura prints (plan.md §2,
 * §5.2.3). Typed columns rather than settings JSON, so this is its own write
 * rather than a merge.
 *
 * The identifiers are validated here, at the only door they come in through:
 * an org.nr that fails its Luhn check is a typo, and a typo in the org.nr on
 * an invoice is the kind of error a customer's bookkeeper bounces the invoice
 * over. `momsRegNr` is left to the tenant rather than always derived, because
 * group and foreign registrations exist — but when it is blank and the org.nr
 * is good, the derived SE-form is filled in, since that is right for an
 * ordinary Swedish company and nobody should have to type it.
 */
export type TenantCompanyProfile = {
  orgNr?: string | null;
  momsRegNr?: string | null;
  bankgiro?: string | null;
  plusgiro?: string | null;
  fskatt?: boolean;
  paymentTermsDays?: number;
  invoiceFooter?: string | null;
};

export async function updateTenantCompanyProfile(
  ctx: TenantContext,
  input: TenantCompanyProfile,
) {
  assertTenantWritable(ctx);

  const values: Partial<typeof tenants.$inferInsert> = {};

  if (input.orgNr !== undefined) {
    const orgNr = blankToNull(input.orgNr);
    if (orgNr !== null) {
      const canonical = toTenDigits(orgNr);
      if (canonical === null || !isValidOrgNr(orgNr)) throw new Error("invalid_org_nr");
      // Stored canonically, ten digits without the hyphen; formatting for
      // display is lib/se/identity's job, never the column's.
      values.orgNr = canonical;
    } else {
      values.orgNr = null;
    }
  }

  if (input.momsRegNr !== undefined) values.momsRegNr = blankToNull(input.momsRegNr);

  if (input.bankgiro !== undefined) {
    const bankgiro = blankToNull(input.bankgiro);
    if (bankgiro !== null && !isValidBankgiro(bankgiro)) throw new Error("invalid_bankgiro");
    values.bankgiro = bankgiro;
  }

  if (input.plusgiro !== undefined) {
    const plusgiro = blankToNull(input.plusgiro);
    if (plusgiro !== null && !isValidPlusgiro(plusgiro)) throw new Error("invalid_plusgiro");
    values.plusgiro = plusgiro;
  }

  if (input.fskatt !== undefined) values.fskatt = input.fskatt;

  if (input.paymentTermsDays !== undefined) {
    // A negative or absurd betalvillkor would produce a förfallodatum before
    // the invoice date. A year is well past any real Swedish payment term.
    if (!Number.isInteger(input.paymentTermsDays) || input.paymentTermsDays < 0 ||
        input.paymentTermsDays > 365) {
      throw new Error("invalid_payment_terms");
    }
    values.paymentTermsDays = input.paymentTermsDays;
  }

  if (input.invoiceFooter !== undefined) values.invoiceFooter = blankToNull(input.invoiceFooter);

  // Fill in the derivable momsregnr when the tenant left it blank.
  const orgNrAfter = values.orgNr !== undefined ? values.orgNr : (await getTenant(ctx.tenantId))?.orgNr;
  if (!blankToNull(values.momsRegNr ?? null) && orgNrAfter) {
    values.momsRegNr = momsRegNrFromOrgNr(orgNrAfter);
  }

  if (Object.keys(values).length > 0) {
    await db.update(tenants).set(values).where(eq(tenants.id, ctx.tenantId));
  }
  return getTenant(ctx.tenantId);
}

/** An emptied form field means "cleared", not "the empty string". */
function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Issues (or rotates) the contacts feed token. Rotation is the revoke path:
 * the previous URL stops resolving the moment this returns, so a link pasted
 * into the wrong spreadsheet can be killed without touching anything else.
 */
export async function regenerateContactsFeedToken(ctx: TenantContext): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await mergeTenantSettings(ctx, { exports: { contactsToken: token } });
  // Written after the settings merge, never before: the hash is only a way
  // to *find* the row that holds the token, so the token is the source of
  // truth and the column follows it.
  await db
    .update(tenants)
    .set({ contactsFeedTokenHash: contactsFeedTokenHash(token) })
    .where(eq(tenants.id, ctx.tenantId));
  return token;
}

export async function clearContactsFeedToken(ctx: TenantContext) {
  await mergeTenantSettings(ctx, { exports: {} });
  await db
    .update(tenants)
    .set({ contactsFeedTokenHash: null })
    .where(eq(tenants.id, ctx.tenantId));
}

/**
 * Resolves a feed token to its tenant. Runs before any TenantContext can
 * exist — structurally the same unauthenticated lookup as the invitation
 * token above and the public quote token (§8), so it lives here in the
 * tenancy module where raw `db` is sanctioned.
 *
 * One indexed equality match on the token's SHA-256 (PLAN.md §14 I1 #2),
 * the same pattern `site_api_keys` uses. This used to scan every tenant and
 * timing-safe compare each stored token, which cost the whole table per
 * unauthenticated request. Hashing is what keeps the lookup constant-time
 * with respect to the token: an attacker learns nothing from how long a
 * miss takes, because every miss is the same single index probe.
 */
export async function resolveTenantByContactsFeedToken(token: string) {
  if (token.length < 32) return null;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.contactsFeedTokenHash, contactsFeedTokenHash(token)))
    .limit(1);
  if (!tenant) return null;

  // The hash found the row; the stored token still decides. Belt and braces
  // against a stale or hand-edited hash column — and the compare stays
  // timing-safe, as it was before.
  const stored = (tenant.settings as TenantSettings | null)?.exports?.contactsToken;
  if (!stored) return null;
  const expected = Buffer.from(stored);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length) return null;
  return timingSafeEqual(expected, provided) ? tenant : null;
}

export async function updateTenantVertical(ctx: TenantContext, vertical: string) {
  return mergeTenantSettings(ctx, { vertical });
}

async function mergeTenantSettings(ctx: TenantContext, patch: Partial<TenantSettings>) {
  assertTenantWritable(ctx);

  const tenant = await getTenant(ctx.tenantId);
  if (!tenant) throw new Error("Tenant not found");

  const current = (tenant.settings ?? {}) as TenantSettings;
  const merged: TenantSettings = {
    ...current,
    ...patch,
    branding: { ...current.branding, ...patch.branding },
    businessHours: patch.businessHours ?? current.businessHours,
    exports: patch.exports ?? current.exports,
    ai: patch.ai ? { ...current.ai, ...patch.ai } : current.ai,
    email: patch.email ? { ...current.email, ...patch.email } : current.email,
    defaultCountry: patch.defaultCountry ?? current.defaultCountry,
    reviewLink: patch.reviewLink ?? current.reviewLink,
    // `??` would be wrong here: turning the flag *off* patches it to `false`,
    // and `false ?? current` keeps the old `true`. Only an absent key means
    // "leave it alone".
    whatsappEnabled:
      patch.whatsappEnabled !== undefined ? patch.whatsappEnabled : current.whatsappEnabled,
  };

  await db.update(tenants).set({ settings: merged }).where(eq(tenants.id, ctx.tenantId));
  return getTenant(ctx.tenantId);
}
