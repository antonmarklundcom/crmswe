// URL-safe business slugs, derived from the name the operator typed.
//
// Two callers, one function: the create form fills the slug box as you type,
// and the server derives it again when the box comes back empty. Deriving it
// in both places is deliberate — the client's copy is a convenience the
// operator can overwrite, and the server never trusts what arrives.

/** Latin-1 letters that `NFD` leaves as one code point rather than splitting. */
const SPECIAL: Record<string, string> = { ß: "ss", æ: "ae", ø: "o", đ: "d", ł: "l", þ: "th" };

/**
 * "Tasación & Cía. S.A." → "tasacion-cia-s-a".
 *
 * Accents are stripped rather than dropped, so "Tasación" keeps its shape as
 * "tasacion" instead of collapsing to "tasacin" — the whole point of a slug
 * for a Spanish-speaking market. Swedish å/ä/ö follow the same rule (a/a/o),
 * which is what the Swedish locale's own convention does for URLs.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ßæøđłþ]/g, (char) => SPECIAL[char] ?? char)
    .normalize("NFD")
    // Combining marks left behind by NFD — this is what removes the accent
    // while keeping the letter.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    // A trim after slicing, in case the cut landed on a separator.
    .replace(/-+$/g, "");
}

/**
 * The first free slug in the `base`, `base-2`, `base-3` … series.
 *
 * `isTaken` is injected rather than imported so this stays a pure decision
 * the tests can drive; the caller passes the tenant lookup.
 */
export async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  limit = 50,
): Promise<string> {
  const root = slugify(base) || "empresa";
  if (!(await isTaken(root))) return root;

  for (let suffix = 2; suffix <= limit; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  // Fifty businesses sharing one name is not a case worth guessing at; the
  // caller reports it rather than inventing a fifty-first.
  throw new Error(`No free slug for "${base}"`);
}
