import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The isolation rule the deleted SIFEN engine carried (docs/VENDERCRM-PLAN.md
// §9), kept for the Swedish fiscal code that replaces it (plan.md §1.8):
// `src/lib/se/` is pure fiscal logic — identity numbers, OCR, and in O2 the
// moms math — and imports nothing from the app around it. Everything it needs
// arrives as a function argument.
//
// That is what makes it testable without a database and safe to call from a
// server action, a worker job, or a future SIE/Peppol export alike. If this
// test starts failing, the fix is to move the offending code out into a
// module, never to relax the test.

const SE_DIR = path.join(process.cwd(), "src/lib/se");

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

describe("se fiscal library boundary", () => {
  const files = sourceFiles(SE_DIR).filter((file) => !file.endsWith("boundary.test.ts"));

  it("has source files to check", () => {
    // Guards against the traversal silently finding nothing and the rest of
    // the suite passing vacuously.
    expect(files.length).toBeGreaterThan(0);
  });

  it("imports nothing from the app around it", () => {
    const violations = files.flatMap((file) =>
      importsOf(file)
        .filter((spec) => /^@\/(?!lib\/se\b)/.test(spec))
        .map((spec) => `${path.relative(process.cwd(), file)} → ${spec}`),
    );

    expect(violations).toEqual([]);
  });
});
