import { describe, expect, it } from "vitest";
import messages from "../../messages/sv.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";

// Guards the Swedish copy file itself — the reference locale for this edition
// (plan.md §1.11). These are the three ways the file has actually broken so
// far, not hypothetical ones.

// Arrays are part of the shape since §5.2.5: the webhook connection guide
// stores each platform's steps as an ordered list, read with t.raw(). They
// flatten by index so every string in them is still covered by the guards
// below — an empty step or a stray "§" in one must fail here too.
type MessageNode = string | MessageNode[] | { [key: string]: MessageNode };

function flatten(tree: MessageNode, prefix = ""): Array<[string, string]> {
  if (typeof tree === "string") return prefix ? [[prefix, tree]] : [];
  const entries: Array<[string, MessageNode]> = Array.isArray(tree)
    ? tree.map((value, index) => [`${prefix}[${index}]`, value])
    : Object.entries(tree).map(([key, value]) => [prefix ? `${prefix}.${key}` : key, value]);

  return entries.flatMap(([path, value]) => flatten(value, path));
}

const entries = flatten(messages as MessageNode);

describe("messages/sv.json", () => {
  it("has messages", () => {
    expect(entries.length).toBeGreaterThan(100);
  });

  it("has no empty or whitespace-only copy", () => {
    const blank = entries.filter(([, value]) => value.trim() === "");
    expect(blank).toEqual([]);
  });

  it("leaks no internal spec references into user-facing copy", () => {
    // A "(conexión manual — PLAN.md §6.2)" once shipped in the WhatsApp
    // connect help text. The spec is for the repo, not the customer.
    const leaks = entries.filter(([, value]) => /PLAN\.md|§/.test(value));
    expect(leaks).toEqual([]);
  });

  it("uses no double-brace placeholders", () => {
    // next-intl parses values as ICU MessageFormat, where `{name}` is a
    // placeholder and `{{name}}` is a syntax error. Merge tags shown to the
    // user must be passed in as an ICU argument instead.
    const doubled = entries.filter(([, value]) => value.includes("{{"));
    expect(doubled).toEqual([]);
  });
});

// Key parity across locales (docs/VENDERCRM-PLAN.md §13 H5 #3). `sv` is the
// reference: a key added there and forgotten in en/es would render as the raw
// key path in the UI, which is exactly the failure a Swedish-speaking author
// can't see. This is the guard that makes the other locales maintainable
// rather than a snapshot that rots.
const LOCALES: Record<string, MessageNode> = {
  en: en as MessageNode,
  es: es as MessageNode,
};

const referenceKeys = new Set(entries.map(([key]) => key));

describe("locale key parity", () => {
  it("ships a messages file for every supported locale", () => {
    expect(Object.keys(LOCALES).concat("sv").sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  for (const [locale, tree] of Object.entries(LOCALES)) {
    const localeEntries = flatten(tree);
    const localeKeys = new Set(localeEntries.map(([key]) => key));

    it(`${locale} has every key sv.json has`, () => {
      expect([...referenceKeys].filter((key) => !localeKeys.has(key))).toEqual([]);
    });

    it(`${locale} has no key sv.json lacks`, () => {
      expect([...localeKeys].filter((key) => !referenceKeys.has(key))).toEqual([]);
    });

    it(`${locale} has no empty or whitespace-only copy`, () => {
      expect(localeEntries.filter(([, value]) => value.trim() === "")).toEqual([]);
    });

    it(`${locale} uses no double-brace placeholders`, () => {
      expect(localeEntries.filter(([, value]) => value.includes("{{"))).toEqual([]);
    });
  }
});

// Shape guard for the webhook connection guide (PLAN.md §5.2.5). /sites reads
// `hookGuide.platforms` whole with t.raw() and hands it straight to the client
// component, so this array is a contract, not just copy: an entry missing an
// id, a label or a non-empty steps list renders a broken tab, and ids that
// drift between locales change which platform a visitor sees.
type Platform = { id: string; label: string; steps: string[] };

function platformsOf(tree: MessageNode): Platform[] {
  const guide = (tree as { app: { sites: { hookGuide: { platforms: unknown } } } }).app.sites
    .hookGuide.platforms;
  expect(Array.isArray(guide)).toBe(true);
  return guide as Platform[];
}

describe("hookGuide.platforms", () => {
  const reference = platformsOf(messages as MessageNode);

  it("ships at least one platform", () => {
    expect(reference.length).toBeGreaterThan(0);
  });

  for (const [locale, tree] of Object.entries({ sv: messages as MessageNode, ...LOCALES })) {
    const platforms = platformsOf(tree);

    it(`${locale} gives every platform an id, a label and steps`, () => {
      expect(
        platforms.filter(
          (platform) =>
            typeof platform?.id !== "string" ||
            typeof platform?.label !== "string" ||
            !Array.isArray(platform?.steps) ||
            platform.steps.length === 0 ||
            platform.steps.some((step) => typeof step !== "string"),
        ),
      ).toEqual([]);
    });

    it(`${locale} lists the same platform ids, in the same order`, () => {
      expect(platforms.map((platform) => platform.id)).toEqual(
        reference.map((platform) => platform.id),
      );
    });
  }
});
