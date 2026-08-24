import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import es from "../../../../messages/es.json";
import en from "../../../../messages/en.json";
import sv from "../../../../messages/sv.json";
import { hookGuidePlatforms } from "./hook-guide-labels";

// Regression suite for the /sites crash.
//
// What actually happened, confirmed by reproducing it from a production
// build: the page addressed `app.sites.hookGuide.platforms` — an ordered
// array — as `platforms.elementor.steps`. next-intl answers a missing key
// with the key path itself, so `steps` arrived at the client component as
// the *string* "app.sites.hookGuide.platforms.elementor.steps", and
// `steps.map(...)` threw. The whole page went down client-side, which is the
// "Application error: a client-side exception has occurred" the operator saw.
//
// src/i18n/messages.test.ts already guards the message file's shape. This
// guards the other half — what the page hands the client component — so the
// two ends of the contract can't drift apart again.

const locales = { es, en, sv } as const;

describe("hookGuidePlatforms", () => {
  for (const [locale, messages] of Object.entries(locales)) {
    it(`builds usable platform tabs from ${locale}.json`, () => {
      // Typed loosely on purpose: the point of the suite is to read the
      // message file exactly as the page does, through next-intl's own
      // resolution, without a compile-time shape standing in for it.
      const t = createTranslator({
        locale,
        messages,
        namespace: "app.sites.hookGuide",
      }) as unknown as { raw: (key: string) => unknown };

      const platforms = hookGuidePlatforms(t.raw("platforms"));

      expect(platforms.length).toBeGreaterThan(0);
      for (const platform of platforms) {
        expect(platform.id).not.toBe("");
        expect(platform.label).not.toBe("");
        // The exact call that threw. If `steps` is ever not an array again,
        // it never reaches the component — it fails here instead.
        expect(Array.isArray(platform.steps)).toBe(true);
        expect(platform.steps.length).toBeGreaterThan(0);
      }
    });
  }

  it("drops the shape that crashed the page: a key path where steps should be", () => {
    const crashed = [
      {
        id: "elementor",
        label: "app.sites.hookGuide.platforms.elementor.label",
        steps: "app.sites.hookGuide.platforms.elementor.steps",
      },
    ];

    expect(hookGuidePlatforms(crashed)).toEqual([]);
  });

  it("returns nothing when the message is not an array at all", () => {
    expect(hookGuidePlatforms(undefined)).toEqual([]);
    expect(hookGuidePlatforms("app.sites.hookGuide.platforms")).toEqual([]);
    expect(hookGuidePlatforms({ elementor: { label: "x", steps: ["y"] } })).toEqual([]);
  });

  it("keeps the good platforms when one entry is malformed", () => {
    const mixed = [
      { id: "elementor", label: "Elementor", steps: ["uno", "dos"] },
      { id: "wix", label: "Wix", steps: [] },
      { id: "zapier", label: "Zapier", steps: ["uno"] },
    ];

    expect(hookGuidePlatforms(mixed).map((p) => p.id)).toEqual(["elementor", "zapier"]);
  });
});
