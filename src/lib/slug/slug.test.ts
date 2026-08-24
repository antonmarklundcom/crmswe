import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./index";

describe("slugify", () => {
  it("keeps the letter and drops the accent", () => {
    // The failure this exists to prevent: "tasacin".
    expect(slugify("Tasación")).toBe("tasacion");
    expect(slugify("Construcciones Ñandutí")).toBe("construcciones-nanduti");
  });

  it("handles the Swedish vowels the same way", () => {
    expect(slugify("Åkeri Öst AB")).toBe("akeri-ost-ab");
  });

  it("collapses punctuation and runs of separators", () => {
    expect(slugify("Tasación & Cía. S.A.")).toBe("tasacion-cia-s-a");
    expect(slugify("  doble   espacio  ")).toBe("doble-espacio");
  });

  it("never leaves a leading or trailing separator", () => {
    expect(slugify("¡Vendé ya!")).toBe("vende-ya");
    expect(slugify("---")).toBe("");
  });

  it("caps the length without ending on a separator", () => {
    const slug = slugify(`${"a".repeat(99)} b`);
    expect(slug.length).toBeLessThanOrEqual(100);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  const taken = (...slugs: string[]) => async (candidate: string) =>
    slugs.includes(candidate);

  it("uses the plain slug when it is free", async () => {
    expect(await uniqueSlug("Tasación", taken())).toBe("tasacion");
  });

  it("counts up past the ones already in use", async () => {
    expect(await uniqueSlug("Tasación", taken("tasacion", "tasacion-2"))).toBe("tasacion-3");
  });

  it("falls back to a real word when the name slugifies to nothing", async () => {
    expect(await uniqueSlug("!!!", taken())).toBe("empresa");
  });

  it("gives up rather than inventing an absurd suffix", async () => {
    const always = async () => true;
    await expect(uniqueSlug("Tasación", always, 3)).rejects.toThrow();
  });
});
