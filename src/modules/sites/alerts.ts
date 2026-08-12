import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { siteIngestHealth, sites } from "@/db/schema";
import type { SiteHealthRow } from "./health";
import { siteHealthStatus } from "./health";

// Ingest alerting (PLAN.md §5.2.5). §5.2.4 recorded per-site health and put
// it on /sites — but a status column only helps someone who already suspects
// a problem and goes looking. The failure being fixed is "the owner finds out
// days later from a customer", and a page he opens *after* he's suspicious
// doesn't close that gap; a message that arrives on its own does.
//
// Same two rules as health.ts: no payloads and no credentials leave here, and
// nothing in this path can cost a lead (it runs on a cron, never on ingest).

export type SiteAlertKind =
  /** The last ingest attempt failed — the integration is broken right now. */
  | "failing"
  /** Nothing has arrived in a while from a site that used to produce leads. */
  | "stale";

/**
 * How long a previously-working site may stay silent before that itself is
 * the alert. Three days, not one: Paraguayan lead flow has a weekly rhythm
 * and plenty of these sites go quiet over a weekend without anything being
 * wrong. Long enough to avoid crying wolf every Monday, short enough that a
 * dead form is caught in the same week it dies.
 */
export const STALE_AFTER_DAYS = 3;

export type AlertCandidate = {
  site: typeof sites.$inferSelect;
  health: SiteHealthRow;
};

export type SiteAlert = AlertCandidate & { kind: SiteAlertKind };

/**
 * The whole judgement, as a pure function so it can be tested without a
 * database or a clock.
 *
 * Returns the alert to send, or null for "say nothing". Null covers more
 * cases than it looks:
 *   - **an inactive site** — the owner turned it off on purpose, and alerting
 *     about a site he paused is noise that teaches him to ignore alerts;
 *   - **a site that has never received anything** — a freshly created site is
 *     not broken, it is unfinished, and it is already visibly "sin datos" on
 *     /sites;
 *   - **anything already alerted about** — `alertedFor` records what was
 *     *sent*, not what happened, so a daily run notifies on the transition
 *     instead of every morning until it's fixed.
 */
export function decideSiteAlert(
  candidate: AlertCandidate,
  now: Date,
  staleAfterDays: number = STALE_AFTER_DAYS,
): SiteAlertKind | null {
  const { site, health } = candidate;
  if (!site.isActive) return null;

  const status = siteHealthStatus(health);
  if (status === "idle") return null;

  if (status === "failing") {
    return health.alertedFor === "failing" ? null : "failing";
  }

  // Healthy but quiet. Only meaningful for a site that has produced before —
  // which `status === "ok"` already guarantees, since ok means a success was
  // recorded.
  const lastSuccess = health.lastSuccessAt;
  if (!lastSuccess) return null;

  const silentMs = now.getTime() - lastSuccess.getTime();
  if (silentMs >= staleAfterDays * 24 * 60 * 60_000) {
    return health.alertedFor === "stale" ? null : "stale";
  }

  return null;
}

/**
 * Whether a site that was alerted about has recovered enough to re-arm — a
 * fresh success clears the flag, so the *next* breakage alerts again instead
 * of being swallowed as "already told him about that one".
 */
export function shouldClearAlert(candidate: AlertCandidate, now: Date): boolean {
  if (!candidate.health.alertedFor) return false;

  // Ask "would this site alert if we had never told him?" — not "does it
  // alert right now", which is always false for a site already flagged. The
  // difference matters for a still-silent site: clearing its flag there would
  // make it alert again tomorrow, and every tomorrow after that, which is the
  // exact daily-repeat noise `alertedFor` exists to prevent.
  const asIfUntold: AlertCandidate = {
    site: candidate.site,
    health: { ...candidate.health, alertedFor: null },
  };
  return decideSiteAlert(asIfUntold, now) === null && siteHealthStatus(candidate.health) === "ok";
}

/**
 * Every site with a health row, across all tenants. A platform-wide read that
 * runs from a cron with no session and therefore no TenantContext —
 * structurally the same pre-context lookup as key resolution in this module
 * and `listSubscriptionsCrossingExpiryWarning` in tenancy (§3.3's documented
 * exemption). The rows are re-scoped per tenant by the caller before any
 * tenant-facing read happens.
 */
export async function listAlertCandidates(): Promise<AlertCandidate[]> {
  const rows = await db
    .select({ site: sites, health: siteIngestHealth })
    .from(siteIngestHealth)
    .innerJoin(sites, eq(sites.id, siteIngestHealth.siteId))
    .where(and(eq(sites.isActive, true), isNotNull(siteIngestHealth.lastOutcome)));

  return rows.map((row) => ({ site: row.site, health: row.health }));
}

/** Records that the owner has been told, so tomorrow's run stays quiet. */
export async function markSiteAlerted(siteId: string, kind: SiteAlertKind): Promise<void> {
  await db
    .update(siteIngestHealth)
    .set({ alertedFor: kind, alertedAt: new Date() })
    .where(eq(siteIngestHealth.siteId, siteId));
}

/** Re-arms a recovered site. */
export async function clearSiteAlert(siteId: string): Promise<void> {
  await db
    .update(siteIngestHealth)
    .set({ alertedFor: null, alertedAt: null })
    .where(eq(siteIngestHealth.siteId, siteId));
}

/** Selects what today's run should send and what it should re-arm. */
export async function collectIngestAlerts(now = new Date()): Promise<{
  alerts: SiteAlert[];
  recovered: AlertCandidate[];
}> {
  const candidates = await listAlertCandidates();
  const alerts: SiteAlert[] = [];
  const recovered: AlertCandidate[] = [];

  for (const candidate of candidates) {
    const kind = decideSiteAlert(candidate, now);
    if (kind) {
      alerts.push({ ...candidate, kind });
    } else if (shouldClearAlert(candidate, now)) {
      recovered.push(candidate);
    }
  }

  return { alerts, recovered };
}
