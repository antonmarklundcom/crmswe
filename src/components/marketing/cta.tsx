import Link from "next/link";

// The single CTA every page ends on (plan.md §6.2: e-post-first, WhatsApp
// never mentioned on the marketing site). `data-ev` / `data-ev-loc` are on
// every conversion element so analytics can be switched on later without
// re-tagging any markup.

export function CtaPair({
  primaryLabel,
  location,
  primaryHref = "/kontakt",
}: {
  primaryLabel: string;
  location: string;
  primaryHref?: string;
}) {
  return (
    <div className="mk-cta-pair">
      <Link
        href={primaryHref}
        className="mk-btn mk-btn--primary"
        data-ev="cta_click"
        data-ev-loc={location}
      >
        {primaryLabel}
      </Link>
    </div>
  );
}
