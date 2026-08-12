import { describe, expect, it } from "vitest";
import {
  decideSiteAlert,
  shouldClearAlert,
  STALE_AFTER_DAYS,
  type AlertCandidate,
} from "./alerts";

// The alert decision (PLAN.md §5.2.5), pure — no database, no clock.
//
// What these cases are really protecting is the owner's willingness to read
// the alerts at all: one repeated notification about a site he already knows
// is broken, or one alert about a site he deliberately paused, and the next
// real one gets ignored.

const NOW = new Date("2026-08-12T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60_000);

function candidate(overrides: {
  isActive?: boolean;
  lastOutcome?: string | null;
  lastSuccessAt?: Date | null;
  lastErrorAt?: Date | null;
  alertedFor?: string | null;
}): AlertCandidate {
  return {
    site: {
      id: "s1",
      tenantId: "t1",
      name: "Dentista",
      isActive: overrides.isActive ?? true,
    } as AlertCandidate["site"],
    health: {
      id: "h1",
      tenantId: "t1",
      siteId: "s1",
      lastOutcome: overrides.lastOutcome ?? null,
      lastSuccessAt: overrides.lastSuccessAt ?? null,
      lastSuccessLane: null,
      lastErrorAt: overrides.lastErrorAt ?? null,
      lastErrorStatus: null,
      lastErrorReason: null,
      lastErrorLane: null,
      alertedFor: overrides.alertedFor ?? null,
      alertedAt: null,
      successCount: 0,
      errorCount: 0,
      createdAt: days(30),
      updatedAt: NOW,
    },
  };
}

describe("decideSiteAlert", () => {
  it("alerts on a site whose last attempt failed", () => {
    const site = candidate({ lastOutcome: "error", lastErrorAt: NOW, lastSuccessAt: days(1) });
    expect(decideSiteAlert(site, NOW)).toBe("failing");
  });

  it("says nothing twice about the same breakage", () => {
    const site = candidate({
      lastOutcome: "error",
      lastErrorAt: NOW,
      lastSuccessAt: days(1),
      alertedFor: "failing",
    });
    // A daily cron must notify on the transition, not every morning until
    // someone fixes it.
    expect(decideSiteAlert(site, NOW)).toBeNull();
  });

  it("stays quiet about a site the owner deliberately deactivated", () => {
    const site = candidate({ isActive: false, lastOutcome: "error", lastErrorAt: NOW });
    expect(decideSiteAlert(site, NOW)).toBeNull();
  });

  it("stays quiet about a site that has never received anything", () => {
    // Freshly created, not broken — and already visibly "sin datos" on /sites.
    expect(decideSiteAlert(candidate({}), NOW)).toBeNull();
  });

  it("alerts when a site that used to produce leads goes silent", () => {
    const site = candidate({
      lastOutcome: "ok",
      lastSuccessAt: days(STALE_AFTER_DAYS + 1),
    });
    expect(decideSiteAlert(site, NOW)).toBe("stale");
  });

  it("tolerates a quiet weekend", () => {
    const site = candidate({ lastOutcome: "ok", lastSuccessAt: days(STALE_AFTER_DAYS - 1) });
    expect(decideSiteAlert(site, NOW)).toBeNull();
  });

  it("does not repeat a staleness alert either", () => {
    const site = candidate({
      lastOutcome: "ok",
      lastSuccessAt: days(STALE_AFTER_DAYS + 5),
      alertedFor: "stale",
    });
    expect(decideSiteAlert(site, NOW)).toBeNull();
  });

  it("escalates a site that was quiet and is now failing", () => {
    // Already told him it was quiet; a hard failure is new information.
    const site = candidate({
      lastOutcome: "error",
      lastErrorAt: NOW,
      lastSuccessAt: days(9),
      alertedFor: "stale",
    });
    expect(decideSiteAlert(site, NOW)).toBe("failing");
  });
});

describe("shouldClearAlert", () => {
  it("re-arms a site that recovered, so the next breakage alerts again", () => {
    const site = candidate({ lastOutcome: "ok", lastSuccessAt: NOW, alertedFor: "failing" });
    expect(shouldClearAlert(site, NOW)).toBe(true);
  });

  it("does not re-arm a site that is still broken", () => {
    const site = candidate({ lastOutcome: "error", lastErrorAt: NOW, alertedFor: "failing" });
    expect(shouldClearAlert(site, NOW)).toBe(false);
  });

  it("does not re-arm a still-silent site", () => {
    const site = candidate({
      lastOutcome: "ok",
      lastSuccessAt: days(STALE_AFTER_DAYS + 2),
      alertedFor: "stale",
    });
    expect(shouldClearAlert(site, NOW)).toBe(false);
  });

  it("has nothing to clear when nothing was ever sent", () => {
    expect(shouldClearAlert(candidate({ lastOutcome: "ok", lastSuccessAt: NOW }), NOW)).toBe(false);
  });
});
