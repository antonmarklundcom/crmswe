import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// "Issued documents are immutable and sequences unbroken" (plan.md §5.2.4,
// §5.2.5) is a claim about the *whole codebase*, not about one function. A
// behavioral test can only prove that the functions it happens to call refuse
// to mutate; it cannot prove that no eleventh function, added next month in
// another module, writes to `documents` directly.
//
// So this suite proves the structural half: outside the documents module,
// nothing writes to the faktura tables at all, and nowhere in the app — the
// documents module included — is there a path that deletes one. The
// behavioral half lives in documents.test.ts, which drives every mutating
// service function against an issued faktura and expects each to refuse.
//
// Together those two are the proof the phase asks for. This one is the half
// that keeps holding after everybody who read plan.md has moved on.

const SRC = path.resolve(__dirname, "../..");
const DOCUMENTS_MODULE = path.join(SRC, "modules", "documents");

/** The tables that hold räkenskapsinformation and must not be written loosely. */
const FISCAL_TABLES = ["documents", "documentItems"];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) found.push(full);
  }
  return found;
}

/** Strips comments and string literals so prose about `delete` isn't a hit. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

const ALL_FILES = sourceFiles(SRC).filter((file) => !file.endsWith(".test.ts"));

describe("issued documents are immutable (structural)", () => {
  it("has no delete path for a document anywhere in the app", () => {
    // Bokföringslagen keeps räkenskapsinformation for seven years, so a
    // faktura is never destroyed — not by the user, not by a cleanup job, not
    // by a cascade. Draft *lines* are replaced when a draft is edited, which
    // is the single `delete(documentItems)` allowed, and it sits behind
    // `requireDraft`.
    const offenders: string[] = [];

    for (const file of ALL_FILES) {
      const body = code(readFileSync(file, "utf8"));
      // `.delete(documents` / `.delete(documentItems` in any form.
      const matches = body.match(/\.delete\(\s*(documents|documentItems)\b/g);
      if (!matches) continue;

      const relative = path.relative(SRC, file);
      for (const match of matches) {
        const isDraftLineReplacement =
          match.includes("documentItems") &&
          file === path.join(DOCUMENTS_MODULE, "documents.ts");
        if (!isDraftLineReplacement) offenders.push(`${relative}: ${match}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("deletes document lines from exactly one place, the draft editor", () => {
    // If that single allowance ever grows a second call site, this fails and
    // whoever added it has to say why in the plan rather than in a diff.
    const body = code(readFileSync(path.join(DOCUMENTS_MODULE, "documents.ts"), "utf8"));
    const deletes = body.match(/\.delete\(\s*documentItems\b/g) ?? [];
    expect(deletes).toHaveLength(1);

    // …and it is guarded: the function it sits in asks for a draft first.
    const editor = body.slice(
      body.indexOf("export async function updateDraftDocument"),
      body.indexOf(".delete(") + 20,
    );
    expect(editor).toContain("requireDraft");
  });

  it("writes to the faktura tables only from inside the documents module", () => {
    // The whole immutability argument rests on every write going through this
    // module's service functions. A `tenantDb(ctx).update(documents)` in a
    // route handler or another module would route around all of it — and
    // would look perfectly ordinary in review.
    const offenders: string[] = [];

    for (const file of ALL_FILES) {
      if (file.startsWith(DOCUMENTS_MODULE + path.sep)) continue;
      const body = code(readFileSync(file, "utf8"));
      for (const table of FISCAL_TABLES) {
        const pattern = new RegExp(`\\.(update|insert)\\(\\s*${table}\\b`, "g");
        for (const match of body.match(pattern) ?? []) {
          offenders.push(`${path.relative(SRC, file)}: ${match}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("never rewrites a document number or a sequence counter outside numbering", () => {
    // An unbroken series depends on the counter only ever moving forward,
    // inside the locked transaction in numbering.ts.
    const offenders: string[] = [];
    for (const file of ALL_FILES) {
      if (file === path.join(DOCUMENTS_MODULE, "numbering.ts")) continue;
      const body = code(readFileSync(file, "utf8"));
      for (const match of body.match(/\.(update|delete|insert)\(\s*documentSequences\b/g) ?? []) {
        offenders.push(`${path.relative(SRC, file)}: ${match}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
