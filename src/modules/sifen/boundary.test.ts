import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// PLAN.md §9's hard rule, enforced rather than documented: the SIFEN engine
// "imports nothing from other modules". This is the extraction seam for the
// standalone e-invoicing SaaS — if this test starts failing, the fix is to
// move the offending code into `modules/invoicing/` (which may call the
// facade freely), never to relax the test.

const SIFEN_DIR = path.join(process.cwd(), "src/modules/sifen");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+["']([^"']+)["']/g;

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return Array.from(source.matchAll(IMPORT_PATTERN), (m) => m[1]);
}

describe("sifen module boundary", () => {
  const files = sourceFiles(SIFEN_DIR);

  it("has source files to check", () => {
    // Guards against the traversal silently finding nothing and the rest of
    // the suite passing vacuously.
    expect(files.length).toBeGreaterThan(0);
  });

  it("imports nothing from another module", () => {
    const violations = files.flatMap((file) =>
      importsOf(file)
        .filter((spec) => /^@\/modules\//.test(spec))
        .filter((spec) => !spec.startsWith("@/modules/sifen"))
        .map((spec) => `${path.relative(process.cwd(), file)} → ${spec}`),
    );

    expect(violations).toEqual([]);
  });

  it("does not reach into the app's shared layers either", () => {
    // `@/db`, `@/lib`, `@/components` are all app-shaped dependencies that
    // would not survive extraction behind an HTTP API. The engine's own
    // tables and helpers live inside this directory; anything it genuinely
    // needs from the host app arrives as a function argument.
    const violations = files.flatMap((file) =>
      importsOf(file)
        .filter((spec) => /^@\/(db|lib|components|app|worker|i18n)\b/.test(spec))
        .map((spec) => `${path.relative(process.cwd(), file)} → ${spec}`),
    );

    expect(violations).toEqual([]);
  });
});
