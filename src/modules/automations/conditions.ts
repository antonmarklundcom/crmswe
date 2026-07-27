import { eq } from "drizzle-orm";
import { conversations, messages } from "@/db/schema";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { getTenant } from "@/modules/tenancy/tenants";
import type { BusinessHours, TenantSettings } from "@/modules/tenancy/settings";
import { listTagsForContact } from "@/modules/crm/contacts";
import { listDealsForContact } from "@/modules/crm/deals";
import type { FlowNode } from "./graph";

// Condition nodes (PLAN.md §7.1). Each returns a boolean; the engine follows
// the yes/no branch.

const DAY_KEYS: Array<keyof BusinessHours> = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export async function evaluateCondition(
  ctx: TenantContext,
  node: Extract<FlowNode, { type: "condition" }>,
  contactId: string,
): Promise<boolean> {
  const config = node.config as Record<string, unknown>;

  switch (config.kind) {
    case "has_tag": {
      const tagId = String(config.tagId ?? "");
      const tags = await listTagsForContact(ctx, contactId);
      return tags.some((tag) => tag.id === tagId);
    }

    case "deal_in_stage": {
      const stageId = String(config.stageId ?? "");
      const deals = await listDealsForContact(ctx, contactId);
      return deals.some((deal) => deal.stageId === stageId);
    }

    case "business_hours":
      return isWithinBusinessHours(ctx);

    case "has_replied_since": {
      // "Has the contact written to us in the last N minutes" — the check
      // behind "only follow up if they went quiet".
      const minutes = Number(config.minutes ?? 60);
      const since = Date.now() - minutes * 60_000;
      return hasInboundSince(ctx, contactId, since);
    }

    default:
      return false;
  }
}

/**
 * messages carry conversationId, not contactId, so this resolves the
 * contact's conversations first. Both reads are tenant-scoped, so a
 * condition can never observe another tenant's traffic.
 */
async function hasInboundSince(
  ctx: TenantContext,
  contactId: string,
  sinceMs: number,
): Promise<boolean> {
  const convos = await tenantDb(ctx).select(
    conversations,
    eq(conversations.contactId, contactId),
  );
  if (convos.length === 0) return false;

  const conversationIds = new Set(convos.map((conversation) => conversation.id));
  const inbound = await tenantDb(ctx).select(messages, eq(messages.direction, "in"));

  return inbound.some(
    (message) =>
      conversationIds.has(message.conversationId) && message.createdAt.getTime() >= sinceMs,
  );
}

/**
 * Business-hours check in the tenant's own timezone (§7.1) — a Paraguayan
 * tenant's "after hours" must not depend on where the server runs, which is
 * the whole point of storing tenants.timezone.
 */
export async function isWithinBusinessHours(ctx: TenantContext, now = new Date()): Promise<boolean> {
  const tenant = await getTenant(ctx.tenantId);
  if (!tenant) return false;

  const settings = (tenant.settings ?? {}) as TenantSettings;
  const hours = settings.businessHours;
  // No configured hours means "always open" rather than "never" — a tenant
  // who hasn't filled the form in shouldn't have every automation silently
  // stop.
  if (!hours) return true;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tenant.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = get("weekday").toLowerCase();
  const dayKey = DAY_KEYS.find((key) => key === weekday.slice(0, 3));
  if (!dayKey) return false;

  const window = hours[dayKey];
  if (!window) return false;

  const minutesNow = Number(get("hour")) * 60 + Number(get("minute"));
  const [startH, startM] = window.start.split(":").map(Number);
  const [endH, endM] = window.end.split(":").map(Number);

  return minutesNow >= startH * 60 + startM && minutesNow < endH * 60 + endM;
}
