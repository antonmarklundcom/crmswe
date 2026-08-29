import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import Script from "next/script";
import { getTranslations } from "next-intl/server";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { CookieConsentBanner, ConsentGatedScripts } from "@/components/marketing/cookie-consent";
import { JsonLd } from "@/components/marketing/json-ld";
import { SITE_URL, siteConfig } from "@/lib/site-config";

// The marketing chrome, kept entirely separate from the app chrome. The `.mk`
// wrapper is what scopes the marketing design tokens (globals.css) — nothing
// in the CRM ever renders inside it.
//
// Two typefaces total: Newsreader for display, and the Geist Sans already
// loaded by the root layout for text. Both via next/font, so no layout shift.

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // No `template` here on purpose: every marketing page writes its own full
  // title, brand included, so the title that ships is exactly the one each
  // page's own `generateMetadata` returns and nothing appends a second brand
  // to it.
  title: siteConfig.name,
};

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("marketing.nav");
  const tc = await getTranslations("marketing.cookie");

  return (
    <div className={`mk ${newsreader.variable}`}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: siteConfig.name,
          url: SITE_URL,
        }}
      />
      <a href="#contenido" className="mk-skip">
        {t("skipToContent")}
      </a>
      <MarketingHeader />
      <main id="contenido">{children}</main>
      <MarketingFooter />

      {/* Scroll reveal, sticky-header state. Reduced-motion guard is inside.
          Pure UI motion — no cookies, no tracking, so it loads unconditionally. */}
      <Script src="/mk-motion.js" strategy="afterInteractive" />

      {/* GDPR-granular consent (plan.md §6.2): the two non-essential scripts
          (attribution + analytics shim) load only once a visitor has opted
          in, never before. */}
      <ConsentGatedScripts />
      <CookieConsentBanner
        copy={{
          body: tc("body"),
          necessaryLabel: tc("necessaryLabel"),
          analyticsLabel: tc("analyticsLabel"),
          saveLabel: tc("saveLabel"),
          acceptAllLabel: tc("acceptAllLabel"),
          settingsLabel: tc("settingsLabel"),
        }}
      />
    </div>
  );
}
