import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A "use server" module may only export async functions. Exporting a shared
// constant from one compiles fine and then throws on the first submit — it
// has now cost two rounds (the calendar form's initial state, then the
// superadmin users console's), each found by clicking the button rather than
// by any check. This is that check.
//
// Types are erased before the rule applies, so `export type` is fine.

const ROOT = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Exports that are neither an async function nor a type. */
const OFFENDING = /^export\s+(?!async function\b|type\b|\{)(\w[\w\s]*)/gm;

describe('"use server" modules', () => {
  it("export async functions and nothing else", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(ROOT)) {
      const source = readFileSync(file, "utf8");
      if (!source.trimStart().startsWith('"use server"')) continue;

      for (const match of source.matchAll(OFFENDING)) {
        offenders.push(`${path.relative(ROOT, file)}: ${match[0].trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
