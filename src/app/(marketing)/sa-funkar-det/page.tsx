import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Eyebrow, Lead } from "@/components/marketing/primitives";
import { MethodDetail, type MethodStep } from "@/components/marketing/method-steps";
import { VerticalCards, type VerticalItem } from "@/components/marketing/vertical-cards";
import { Statement } from "@/components/marketing/statement";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd, faqJsonLd } from "@/components/marketing/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.saFunkarDet.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/sa-funkar-det" },
  };
}

export default async function SaFunkarDetPage() {
  const t = await getTranslations("marketing");
  const faqItems = t.raw("saFunkarDet.faq.items") as FaqItem[];

  // Pattern map: header P2 offset · steps P7 sticky-side · included P3
  // staggered grid · statement P9 · faq P4 · closing overlap + ink band.
  return (
    <>
      <JsonLd data={faqJsonLd(faqItems)} />
      <section className="mk-section" aria-labelledby="mk-safunkardet-title">
        <div className="mk-wrap mk-offset">
          <Eyebrow>{t("saFunkarDet.header.eyebrow")}</Eyebrow>
          <h1 id="mk-safunkardet-title">{t("saFunkarDet.header.title")}</h1>
          <Lead>{t("saFunkarDet.header.lead")}</Lead>
          <p>{t("saFunkarDet.header.body")}</p>
        </div>
      </section>

      <MethodDetail
        eyebrow={t("saFunkarDet.steps.eyebrow")}
        title={t("saFunkarDet.steps.title")}
        steps={t.raw("saFunkarDet.steps.items") as MethodStep[]}
      />

      <VerticalCards
        eyebrow={t("saFunkarDet.included.eyebrow")}
        title={t("saFunkarDet.included.title")}
        lead={t("saFunkarDet.included.lead")}
        items={
          (t.raw("saFunkarDet.included.items") as Array<{ title: string; body: string }>).map(
            (item): VerticalItem => ({ name: item.title, body: item.body }),
          )
        }
      />

      <Statement text={t("saFunkarDet.statement.text")} sub={t("saFunkarDet.statement.sub")} />

      <Faq
        eyebrow={t("saFunkarDet.faq.eyebrow")}
        title={t("saFunkarDet.faq.title")}
        items={faqItems}
      />

      <CtaBand
        eyebrow={t("home.closing.eyebrow")}
        title={t("home.closing.title")}
        body={t("home.closing.body")}
        panelTitle={t("home.closing.panelTitle")}
        panelItems={t.raw("home.closing.panelItems") as string[]}
        cta={{ primaryLabel: t("cta.primary") }}
      />
    </>
  );
}
