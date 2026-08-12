// Dot/bracket path resolution over arbitrary parsed JSON (PLAN.md §5.2).
//
// This exists because the webhook lane accepts whatever shape a form builder
// sends: Elementor nests values under `fields.telefono.value`, Wix under
// `data.submissions[2].fieldValue`, Zapier flattens everything. A per-site
// mapping names the path to each CRM field, and this file is what walks it.
//
// Deliberately not a dependency: the whole grammar is "keys, dots and
// brackets", the failure mode we need is `undefined` rather than a throw, and
// a lodash-style `get` would drag in prototype-pollution semantics we then
// have to defend against anyway. It is ~40 lines and fully tested.

/**
 * Splits a path into segments. Understands:
 *   `a.b.c`            → ["a","b","c"]
 *   `a[0].b`           → ["a","0","b"]
 *   `a["x.y"]`         → ["a","x.y"]      (quoted keys may contain dots)
 *   `a['x']`           → ["a","x"]
 *   `["top"].b`        → ["top","b"]
 * Returns [] for an empty or unusable path, which resolves to undefined.
 */
export function parsePath(path: string): string[] {
  const segments: string[] = [];
  let current = "";
  let i = 0;

  const push = () => {
    if (current !== "") segments.push(current);
    current = "";
  };

  while (i < path.length) {
    const char = path[i];

    if (char === ".") {
      push();
      i += 1;
      continue;
    }

    if (char === "[") {
      push();
      i += 1;
      const quote = path[i] === '"' || path[i] === "'" ? path[i] : null;
      if (quote) {
        i += 1;
        let key = "";
        while (i < path.length && path[i] !== quote) {
          // Backslash escapes the quote character inside a quoted key.
          if (path[i] === "\\" && i + 1 < path.length) i += 1;
          key += path[i];
          i += 1;
        }
        i += 1; // closing quote
        segments.push(key);
      } else {
        let key = "";
        while (i < path.length && path[i] !== "]") {
          key += path[i];
          i += 1;
        }
        if (key.trim() !== "") segments.push(key.trim());
      }
      if (path[i] === "]") i += 1;
      continue;
    }

    current += char;
    i += 1;
  }

  push();
  return segments;
}

/** Keys that would let a crafted payload reach into a prototype. A mapping
 * is written by the tenant, not the caller, but the *payload* is attacker-
 * controlled, so the walk refuses them on principle. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Reads `path` out of `value`. Returns undefined for anything that isn't
 * there — a missing key, an out-of-range index, a walk through a null, a
 * primitive that can't be descended into. Never throws: the caller is a
 * public webhook handler, and a mistyped mapping must produce "phone not
 * found", not a 500.
 */
export function resolvePath(value: unknown, path: string): unknown {
  const segments = parsePath(path);
  if (segments.length === 0) return undefined;

  let current = value;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (FORBIDDEN_KEYS.has(segment)) return undefined;

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }

    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Resolves a path and flattens the result to a trimmed string, which is what
 * every CRM field here wants. Numbers and booleans stringify; objects,
 * arrays, null and empty strings resolve to undefined so a caller can tell
 * "not mapped" from "mapped to an empty value".
 */
export function resolveString(value: unknown, path: string | undefined): string | undefined {
  if (!path) return undefined;
  const resolved = resolvePath(value, path);

  if (typeof resolved === "string") return resolved.trim() || undefined;
  if (typeof resolved === "number" || typeof resolved === "boolean") return String(resolved);
  return undefined;
}

export type LeafPath = { path: string; value: string };

/**
 * Every leaf in a payload, as `path` → short preview. This is what turns
 * capture mode into something a non-developer can use: instead of typing
 * `data.fields[2].value` from memory, they pick it from a list built out of
 * their own test submission.
 *
 * Bounded on purpose — a hostile or merely huge payload must not turn the
 * settings page into a memory problem.
 */
export function listLeafPaths(
  value: unknown,
  options: { maxLeaves?: number; maxDepth?: number; maxValueLength?: number } = {},
): LeafPath[] {
  const maxLeaves = options.maxLeaves ?? 200;
  const maxDepth = options.maxDepth ?? 8;
  const maxValueLength = options.maxValueLength ?? 120;
  const out: LeafPath[] = [];

  const walk = (node: unknown, prefix: string, depth: number) => {
    if (out.length >= maxLeaves || depth > maxDepth) return;

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${prefix}[${index}]`, depth + 1));
      return;
    }

    if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (out.length >= maxLeaves) return;
        // A key with a dot or bracket in it has to be quoted to survive a
        // round trip through parsePath.
        const safe = /^[A-Za-z0-9_$-]+$/.test(key);
        const next = prefix
          ? safe
            ? `${prefix}.${key}`
            : `${prefix}["${key}"]`
          : safe
            ? key
            : `["${key}"]`;
        walk(child, next, depth + 1);
      }
      return;
    }

    if (node === null || node === undefined || node === "") return;
    if (!prefix) return;

    const text = String(node);
    out.push({
      path: prefix,
      value: text.length > maxValueLength ? `${text.slice(0, maxValueLength)}…` : text,
    });
  };

  walk(value, "", 0);
  return out;
}
