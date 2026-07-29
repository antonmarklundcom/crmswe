import { describe, expect, it } from "vitest";
import messages from "../../messages/es.json";

// Guards the Spanish copy file itself (PLAN.md §10 1H: "pass through UI for
// Spanish copy consistency"). These are the three ways the file has actually
// broken so far, not hypothetical ones.

type MessageTree = { [key: string]: string | MessageTree };

function flatten(tree: MessageTree, prefix = ""): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [[path, value] as [string, string]] : flatten(value, path);
  });
}

const entries = flatten(messages as MessageTree);

describe("messages/es.json", () => {
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
