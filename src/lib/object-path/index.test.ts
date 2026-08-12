import { describe, expect, it } from "vitest";
import { listLeafPaths, parsePath, resolvePath, resolveString } from "./index";

// The path resolver behind the webhook lane's per-site field mapping
// (PLAN.md §5.2). Pure — no DB, no network.

describe("parsePath", () => {
  it("splits dots, bracket indexes and quoted keys", () => {
    expect(parsePath("fields.telefono.value")).toEqual(["fields", "telefono", "value"]);
    expect(parsePath("data.fields[2].value")).toEqual(["data", "fields", "2", "value"]);
    expect(parsePath('a["x.y"].b')).toEqual(["a", "x.y", "b"]);
    expect(parsePath("a['x'].b")).toEqual(["a", "x", "b"]);
    expect(parsePath('["top"].b')).toEqual(["top", "b"]);
    expect(parsePath("plain")).toEqual(["plain"]);
  });

  it("returns nothing usable for empty or degenerate paths", () => {
    expect(parsePath("")).toEqual([]);
    expect(parsePath(".")).toEqual([]);
    expect(parsePath("[]")).toEqual([]);
  });
});

describe("resolvePath", () => {
  const payload = {
    data: {
      fields: [{ value: "primero" }, { value: "segundo" }],
      "campo raro": { "con.punto": "raro" },
    },
    top: "nivel superior",
    zero: 0,
    flag: false,
    nothing: null,
  };

  it("walks objects and arrays", () => {
    expect(resolvePath(payload, "top")).toBe("nivel superior");
    expect(resolvePath(payload, "data.fields[1].value")).toBe("segundo");
    expect(resolvePath(payload, 'data["campo raro"]["con.punto"]')).toBe("raro");
  });

  it("returns undefined instead of throwing on anything missing", () => {
    expect(resolvePath(payload, "data.fields[9].value")).toBeUndefined();
    expect(resolvePath(payload, "nothing.deeper")).toBeUndefined();
    expect(resolvePath(payload, "top.deeper")).toBeUndefined();
    expect(resolvePath(payload, "no.such.path")).toBeUndefined();
    expect(resolvePath(payload, "")).toBeUndefined();
    expect(resolvePath(null, "a.b")).toBeUndefined();
    expect(resolvePath(payload, "data.fields[-1]")).toBeUndefined();
    expect(resolvePath(payload, "data.fields[uno]")).toBeUndefined();
  });

  it("refuses to walk into the prototype chain", () => {
    // The mapping is tenant-written but the payload is attacker-controlled;
    // no path may reach an inherited member.
    expect(resolvePath(payload, "__proto__")).toBeUndefined();
    expect(resolvePath(payload, "constructor.name")).toBeUndefined();
    expect(resolvePath({ a: {} }, "a.__proto__.polluted")).toBeUndefined();
  });

  it("distinguishes falsy leaves from missing ones", () => {
    expect(resolvePath(payload, "zero")).toBe(0);
    expect(resolvePath(payload, "flag")).toBe(false);
    expect(resolvePath(payload, "nothing")).toBeNull();
  });
});

describe("resolveString", () => {
  const payload = { a: "  hola  ", n: 42, b: true, empty: "   ", obj: { x: 1 }, arr: [1] };

  it("trims strings and stringifies scalars", () => {
    expect(resolveString(payload, "a")).toBe("hola");
    expect(resolveString(payload, "n")).toBe("42");
    expect(resolveString(payload, "b")).toBe("true");
  });

  it("treats blank, missing, object and array values as unmapped", () => {
    expect(resolveString(payload, "empty")).toBeUndefined();
    expect(resolveString(payload, "missing")).toBeUndefined();
    expect(resolveString(payload, "obj")).toBeUndefined();
    expect(resolveString(payload, "arr")).toBeUndefined();
    expect(resolveString(payload, undefined)).toBeUndefined();
  });
});

describe("listLeafPaths", () => {
  it("produces paths that resolvePath can read back", () => {
    const payload = {
      form: { name: "Contacto" },
      fields: [{ id: "telefono", value: "0981123456" }],
      "raro.clave": "sí",
    };

    const leaves = listLeafPaths(payload);
    const paths = leaves.map((leaf) => leaf.path);

    expect(paths).toContain("form.name");
    expect(paths).toContain("fields[0].value");
    expect(paths).toContain('["raro.clave"]');
    // The round trip is the whole contract: the UI offers these paths and
    // stores them verbatim as the mapping.
    for (const leaf of leaves) {
      expect(String(resolvePath(payload, leaf.path))).toBe(leaf.value);
    }
  });

  it("skips empty leaves and truncates long values", () => {
    const leaves = listLeafPaths({ empty: "", nil: null, long: "x".repeat(300) });
    expect(leaves.map((leaf) => leaf.path)).toEqual(["long"]);
    expect(leaves[0].value.endsWith("…")).toBe(true);
    expect(leaves[0].value.length).toBeLessThanOrEqual(121);
  });

  it("stays bounded on a hostile payload", () => {
    let deep: unknown = "fondo";
    for (let i = 0; i < 50; i += 1) deep = { next: deep };
    expect(listLeafPaths(deep, { maxDepth: 5 })).toEqual([]);

    const wide = Object.fromEntries(
      Array.from({ length: 1000 }, (_, i) => [`k${i}`, `v${i}`]),
    );
    expect(listLeafPaths(wide).length).toBeLessThanOrEqual(200);
  });
});
