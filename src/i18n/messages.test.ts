import { describe, expect, it } from "vitest";
import messages from "../../messages/es.json";

// Guards the Spanish copy file itself (PLAN.md §10 1H: "pass through UI for
// Spanish copy consistency"). These are the three ways the file has actually
// broken so far, not hypothetical ones.

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
