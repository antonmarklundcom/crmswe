import { describe, expect, it } from "vitest";
import { escapeLike } from "./sql-like";

// The ⌘K palette (PLAN.md §13 H8) feeds whatever the rep typed straight into
// a LIKE pattern. Before this escaping, "%" and "_" kept their wildcard
// meaning: "50%" matched every row beginning "50" rather than the literal
// text, and "%%" matched the entire table — which, combined with the missing
// SQL LIMITs in modules/crm/search.ts, made a full-table read reachable from
// the search box on every keystroke.

describe("escapeLike", () => {
  it("escapes the two LIKE wildcards", () => {
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
  });

  it("escapes the escape character itself, so a wildcard can't be smuggled in", () => {
    // Without this, a typed "\%" would reach MySQL as an escaped wildcard
    // the user chose rather than one the code chose.
    expect(escapeLike("a\\%b")).toBe("a\\\\\\%b");
  });

  it("escapes every occurrence, not just the first", () => {
    expect(escapeLike("%a%b%")).toBe("\\%a\\%b\\%");
  });

  it("leaves ordinary queries untouched", () => {
    expect(escapeLike("Juan Pérez")).toBe("Juan Pérez");
    expect(escapeLike("+595981123456")).toBe("+595981123456");
    expect(escapeLike("COT-000123")).toBe("COT-000123");
    expect(escapeLike("")).toBe("");
  });
});
