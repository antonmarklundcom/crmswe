import Link from "next/link";
import { whatsappHref } from "@/lib/site-config";

// The CTA pair every page ends on (plan: short qualifying form + WhatsApp
// deep link). `data-ev` / `data-ev-loc` are on every conversion element so
// analytics can be switched on later without re-tagging any markup.

/** WhatsApp mark. Green appears here and nowhere else on the site. */
function WhatsAppGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.64 4.2 3.71.59.25 1.04.4 1.4.52.59.19 1.12.16 1.55.1.47-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}

export function WhatsAppLink({
  label,
  prefill,
  location,
  className = "mk-btn mk-btn--wa",
}: {
  label: string;
  prefill: string;
  location: string;
  className?: string;
}) {
  const href = whatsappHref(prefill);
  // No number configured yet (site-config TODO): render nothing rather than
  // a wa.me link to a number nobody owns. The form CTA next to it still works.
  if (!href) return null;

  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      data-ev="whatsapp_click"
      data-ev-loc={location}
    >
      <WhatsAppGlyph />
      {label}
    </a>
  );
}

export function CtaPair({
  primaryLabel,
  whatsappLabel,
  whatsappPrefill,
  location,
  primaryHref = "/contacto",
}: {
  primaryLabel: string;
  whatsappLabel: string;
  whatsappPrefill: string;
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
      <WhatsAppLink
        label={whatsappLabel}
        prefill={whatsappPrefill}
        location={location}
      />
    </div>
  );
}
