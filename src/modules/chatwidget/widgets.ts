import { eq } from "drizzle-orm";
import { chatWidgets } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Widget configuration (docs/SPEC-CHAT-WIDGET.md §2). Service layer only.

export type ChatWidget = typeof chatWidgets.$inferSelect;

export class ChatWidgetError extends Error {
  constructor(readonly code: "notFound" | "forbidden" | "exists") {
    super(`chat_widget_${code}`);
  }
}

/**
 * The public identifier in the embed snippet. Deliberately *not* a secret:
 * it renders into page source, the same as a Turnstile site key (§5.2.1), so
 * it is generated for uniqueness rather than for unguessability and nothing
 * is authorised by holding it.
 */
export function newWidgetKey(): string {
  return `wgt_${newId()}`;
}

export const DEFAULT_MAX_REPLIES_PER_CONVERSATION_PER_DAY = 12;
/** A typo in the settings form must not become a bill (§10 1O's discipline). */
export const MAX_REPLIES_PER_CONVERSATION_LIMIT = 60;

export type ChatWidgetInput = {
  siteId: string;
  name: string;
  mode?: "off" | "draft" | "send";
  isActive?: boolean;
  avatarUrl?: string | null;
  primaryColor?: string | null;
  greeting?: string | null;
  launcherLabel?: string | null;
  position?: "right" | "left";
  offlineMessage?: string | null;
  systemPrompt?: string | null;
  neverPromise?: string | null;
  maxRepliesPerConversationPerDay?: number | null;
  askForPhone?: boolean;
  captureAfterMessages?: number;
  createDeal?: boolean;
  defaultPipelineId?: string | null;
  defaultStageId?: string | null;
  defaultTagIds?: string[];
  defaultOwnerUserId?: string | null;
  allowedOrigins?: string[];
  businessHoursMode?: "always" | "business_hours";
};

function assertAdmin(ctx: TenantContext): void {
  if (ctx.role !== "admin") throw new ChatWidgetError("forbidden");
}

export async function listChatWidgets(ctx: TenantContext): Promise<ChatWidget[]> {
  return tenantDb(ctx).select(chatWidgets);
}

export async function getChatWidget(ctx: TenantContext, id: string): Promise<ChatWidget | null> {
  const [row] = await tenantDb(ctx).select(chatWidgets, eq(chatWidgets.id, id)).limit(1);
  return row ?? null;
}

export async function getChatWidgetForSite(
  ctx: TenantContext,
  siteId: string,
): Promise<ChatWidget | null> {
  const [row] = await tenantDb(ctx).select(chatWidgets, eq(chatWidgets.siteId, siteId)).limit(1);
  return row ?? null;
}

export async function createChatWidget(
  ctx: TenantContext,
  input: ChatWidgetInput,
): Promise<ChatWidget | null> {
  assertAdmin(ctx);
  if (await getChatWidgetForSite(ctx, input.siteId)) throw new ChatWidgetError("exists");

  const id = newId();
  await tenantDb(ctx)
    .insert(chatWidgets)
    .values({ id, widgetKey: newWidgetKey(), ...toRow(input) });
  return getChatWidget(ctx, id);
}

export async function updateChatWidget(
  ctx: TenantContext,
  id: string,
  input: ChatWidgetInput,
): Promise<ChatWidget | null> {
  assertAdmin(ctx);
  const existing = await getChatWidget(ctx, id);
  if (!existing) throw new ChatWidgetError("notFound");

  await tenantDb(ctx)
    .update(chatWidgets)
    .set({ ...toRow(input), updatedAt: new Date() })
    .where(eq(chatWidgets.id, id));
  return getChatWidget(ctx, id);
}

/**
 * Rotating the key is how a widget is un-embedded from a site the tenant no
 * longer controls. It is not a revocation of a secret — the key was never
 * one — it is a rename that the old page source no longer matches.
 */
export async function rotateWidgetKey(ctx: TenantContext, id: string): Promise<ChatWidget | null> {
  assertAdmin(ctx);
  await tenantDb(ctx)
    .update(chatWidgets)
    .set({ widgetKey: newWidgetKey(), updatedAt: new Date() })
    .where(eq(chatWidgets.id, id));
  return getChatWidget(ctx, id);
}

function toRow(input: ChatWidgetInput) {
  return {
    siteId: input.siteId,
    name: input.name,
    // Absent or unrecognised resolves to draft, at the write and again at the
    // read — "start every tenant on draft" is a guarantee, not a form default.
    mode: input.mode === "off" || input.mode === "send" ? input.mode : ("draft" as const),
    isActive: input.isActive ?? true,
    avatarUrl: input.avatarUrl ?? null,
    primaryColor: input.primaryColor ?? null,
    greeting: input.greeting ?? null,
    launcherLabel: input.launcherLabel ?? null,
    position: input.position ?? ("right" as const),
    offlineMessage: input.offlineMessage ?? null,
    systemPrompt: input.systemPrompt ?? null,
    neverPromise: input.neverPromise ?? null,
    maxRepliesPerConversationPerDay: clampCap(input.maxRepliesPerConversationPerDay),
    askForPhone: input.askForPhone ?? true,
    captureAfterMessages: Math.max(1, Math.min(20, input.captureAfterMessages ?? 2)),
    createDeal: input.createDeal ?? false,
    defaultPipelineId: input.defaultPipelineId ?? null,
    defaultStageId: input.defaultStageId ?? null,
    defaultTagIds: input.defaultTagIds ?? [],
    defaultOwnerUserId: input.defaultOwnerUserId ?? null,
    allowedOrigins: input.allowedOrigins ?? [],
    businessHoursMode: input.businessHoursMode ?? ("always" as const),
  };
}

function clampCap(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(Math.floor(value), MAX_REPLIES_PER_CONVERSATION_LIMIT);
}

/**
 * Allowlist matching for the **embedding page**.
 *
 * Enforced at exactly one place: the iframe document request at
 * `/w/[widgetKey]`, whose `Referer` *is* the host page that embedded us
 * (docs/SPEC-CHAT-WIDGET.md §1.2). It is deliberately **not** applied to the
 * chat's own API calls — those are same-origin fetches from our iframe, so
 * their `Origin` is the CRM's own and carries nothing about the site the
 * visitor is actually on. Checking it there did not bound anything; it only
 * 403'd every tenant who filled the field in.
 *
 * Documented plainly as **not an auth boundary**: `Referer` is a browser
 * courtesy that any non-browser client omits or forges freely, and a
 * referrer policy on the host page can suppress it. It stops casual
 * re-embedding of a key that is public anyway; what actually bounds the
 * damage is the rate limits, the Turnstile challenge and the spend caps.
 *
 * An empty list means "any page", which is what a tenant who hasn't
 * configured one has — and the UI says so rather than pretending otherwise.
 * A non-empty list with no `Referer` at all is a refusal: once a tenant has
 * named their sites, an unattributable embed is not one of them.
 */
export function originAllowed(allowed: string[], origin: string | null): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return false;

  const normalized = normalizeOrigin(origin);
  return allowed.some((entry) => {
    const candidate = normalizeOrigin(entry);
    if (!candidate) return false;
    if (candidate === normalized) return true;
    // A leading dot is the explicit "and its subdomains" form; a bare host
    // never matches a subdomain, because `evil-example.com` must not pass
    // for `example.com`.
    if (candidate.startsWith(".")) return normalized.endsWith(candidate);
    return false;
  });
}

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.startsWith(".")) return trimmed;
  try {
    // Scheme and port are part of an origin, but a tenant pasting
    // "example.com" means the site, so compare on host alone.
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return trimmed;
  }
}
