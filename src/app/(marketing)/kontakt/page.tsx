import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Eyebrow, Lead, MarkedList } from "@/components/marketing/primitives";
import { ContactForm, type ContactFormCopy } from "@/components/marketing/contact-form";
import { TrustRibbon } from "@/components/marketing/trust-ribbon";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { JsonLd, faqJsonLd } from "@/components/marketing/json-ld";
import { contact } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.kontakt.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/kontakt" },
  };
}

export default async function KontaktPage({
  searchParams,
}: {
  searchParams: Promise<{ skickat?: string; error?: string }>;
}) {
  const t = await getTranslations("marketing");
  const params = await searchParams;
  const sent = params.skickat === "1";
  const phoneError = params.error === "telefon";
  const faqItems = t.raw("kontakt.faq.items") as FaqItem[];

  const formCopy: ContactFormCopy = {
    name: t("kontakt.form.name"),
    company: t("kontakt.form.company"),
    phone: t("kontakt.form.phone"),
    phonePlaceholder: t("kontakt.form.phonePlaceholder"),
    phoneHint: t("kontakt.form.phoneHint"),
    emailOptional: t("kontakt.form.emailOptional"),
    sector: t("kontakt.form.sector"),
    sectorPlaceholder: t("kontakt.form.sectorPlaceholder"),
    sectorOptions: t.raw("kontakt.form.sectorOptions") as string[],
    messageOptional: t("kontakt.form.messageOptional"),
    submit: t("kontakt.form.submit"),
    privacy: t("kontakt.form.privacy"),
    honeypotLabel: t("kontakt.form.honeypotLabel"),
  };

  // Pattern map: header + form P1 mirrored 5/7 · ribbon P8 · faq P4.
  return (
    <>
      <JsonLd data={faqJsonLd(faqItems)} />
      <section className="mk-section" aria-labelledby="mk-kontakt-title">
        <div className="mk-wrap">
          <div style={{ maxWidth: "48rem" }}>
            <Eyebrow>{t("kontakt.header.eyebrow")}</Eyebrow>
            <h1 id="mk-kontakt-title">{t("kontakt.header.title")}</h1>
            <Lead>{t("kontakt.header.lead")}</Lead>
          </div>

          <div className="mk-split mk-split--mirror" style={{ marginTop: "3rem", alignItems: "start" }}>
            <aside className="mk-card mk-card--hair">
              <h3>{t("kontakt.aside.title")}</h3>
              <MarkedList items={t.raw("kontakt.aside.steps") as string[]} />

              <h3 style={{ marginTop: "2rem" }}>{t("kontakt.aside.pricingTitle")}</h3>
              <p>{t("kontakt.aside.pricingBody")}</p>
            </aside>

            <div className="mk-card mk-card--raised">
              {sent ? (
                <div>
                  <h2 style={{ fontSize: "var(--mk-t-2)" }}>{t("kontakt.success.title")}</h2>
                  <p>{t("kontakt.success.body")}</p>
                  <div className="mk-cta-pair">
                    <Link href="/" className="mk-btn mk-btn--ghost">
                      {t("kontakt.success.backLabel")}
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {phoneError ? (
                    <div className="mk-notice" role="alert">
                      <p>{t("kontakt.errors.phone")}</p>
                    </div>
                  ) : null}
                  <ContactForm copy={formCopy} />
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <TrustRibbon
        items={[
          t("ribbon.monthly"),
          t("ribbon.measured"),
          t("ribbon.ownData"),
          ...(contact.orgNr ? [t("ribbon.orgNr", { orgNr: contact.orgNr })] : []),
        ]}
      />

      <Faq title={t("kontakt.faq.title")} items={faqItems} id="mk-kontakt-faq" />
    </>
  );
}
