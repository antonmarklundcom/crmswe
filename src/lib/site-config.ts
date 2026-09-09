import { SITE_URL } from "@/lib/config/hosts";

/**
 * Single source of truth for every launch-day detail of the Swedish
 * marketing + CRM site (plan.md §1.14, §6.1).
 *
 * Infra (hosts) and content (brand, locale, contact) are split on purpose:
 * hosts read from env so the real domain is a deploy-time config change, not
 * a code change; content stays a placeholder literal here until Anton
 * supplies the real brand (plan.md §7) — at that point it is still a
 * one-file edit, just without touching the env wiring.
 *
 * Everything the owner still has to supply lives in `contact` below as an
 * explicit `null` with a TODO next to it. `null` is deliberate rather than a
 * dummy string: the components read these through the helpers at the bottom
 * and simply omit the element when a detail is missing, so the site never
 * renders a placeholder phone number or a wa.me link pointing at a number
 * nobody owns. Filling them in is a one-file edit (PLAN.md §12).
 */


export const siteConfig = {
  // Placeholder brand (plan.md §1.14) until Anton supplies the real
  // name — everything brand-related flows through this one field.
  name: "CRM Swe",
  /** Used by `generateMetadata` in the SEO step; kept here so it moves with the rest. */
  url: SITE_URL,
  locale: "sv-SE",
} as const;

/**
 * Home hero background loop. TODO(owner): this points at the Higgsfield
 * generation CDN — fine for review, but download it and serve it from
 * /public/videos/hero-loop.mp4 before launch so the hero doesn't depend on a
 * third party's URL staying valid indefinitely. (The sandbox this was built
 * in couldn't reach that CDN to do the download itself — see build notes.)
 */
export const HERO_VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_349VrHjTFIpx9q71lpfpAXcLXvR/hf_20260905_033405_0a8f4e5a-079f-4e9c-a77c-75a2a8ffa438.mp4";

export const contact = {
  // TODO(owner): WhatsApp number in international format, digits only, no "+"
  // and no spaces — e.g. "46701234567". WhatsApp is hidden behind a
  // per-tenant flag for the Swedish product (plan.md §1.7, §5.3.1) and is
  // never surfaced on the marketing site; this field stays null here.
  whatsappNumber: null as string | null,

  // TODO(owner): landline / mobile shown in the header and footer.
  // `phoneE164` feeds the tel: href, `phoneDisplay` is what the visitor reads.
  phoneE164: null as string | null,
  phoneDisplay: null as string | null,

  // TODO(owner): contact address shown in the footer.
  email: null as string | null,

  // TODO(owner): physical address, one line. Omitted from the footer while null.
  address: null as string | null,

  // TODO(owner): org.nr, shown in the trust ribbon as proof this is a real
  // company (plan.md §1.9, §7 "Company details for the marketing footer").
  orgNr: null as string | null,
} as const;

/**
 * WhatsApp deep link with a prefilled message that names the page it came
 * from, so conversations are self-attributing even before analytics exists
 * (`web-design-system`, analytics-prep §5). Returns null when no number is
 * configured — callers render the form CTA alone rather than a broken link.
 */
export function whatsappHref(prefilledMessage: string): string | null {
  if (!contact.whatsappNumber) return null;
  return `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(prefilledMessage)}`;
}

export function telHref(): string | null {
  return contact.phoneE164 ? `tel:${contact.phoneE164}` : null;
}
