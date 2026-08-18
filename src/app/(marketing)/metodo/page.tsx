import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Eyebrow, Lead } from "@/components/marketing/primitives";
import { MethodDetail, type MethodStep } from "@/components/marketing/method-steps";
import { VerticalCards, type VerticalItem } from "@/components/marketing/vertical-cards";
import { Statement } from "@/components/marketing/statement";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { CtaBand } from "@/components/marketing/cta-band";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.metodo.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/metodo" },
  };
}

export default async function MetodoPage() {
  const t = await getTranslations("marketing");

  // Pattern map: header P2 offset · steps P7 sticky-side · included P3
  // staggered grid · statement P9 · faq P4 · closing overlap + ink band.
  return (
    <>
      <section className="mk-section" aria-labelledby="mk-metodo-title">
        <div className="mk-wrap mk-offset">
          <Eyebrow>{t("metodo.header.eyebrow")}</Eyebrow>
          <h1 id="mk-metodo-title">{t("metodo.header.title")}</h1>
          <Lead>{t("metodo.header.lead")}</Lead>
          <p>{t("metodo.header.body")}</p>
        </div>
      </section>

      <MethodDetail
        eyebrow={t("metodo.steps.eyebrow")}
        title={t("metodo.steps.title")}
        steps={t.raw("metodo.steps.items") as MethodStep[]}
      />

      <VerticalCards
        eyebrow={t("metodo.included.eyebrow")}
        title={t("metodo.included.title")}
        lead={t("metodo.included.lead")}
        items={
          (t.raw("metodo.included.items") as Array<{ title: string; body: string }>).map(
            (item): VerticalItem => ({ name: item.title, body: item.body }),
          )
        }
      />

      <Statement text={t("metodo.statement.text")} sub={t("metodo.statement.sub")} />

      <Faq
        eyebrow={t("metodo.faq.eyebrow")}
        title={t("metodo.faq.title")}
        items={t.raw("metodo.faq.items") as FaqItem[]}
      />

      <CtaBand
        eyebrow={t("home.closing.eyebrow")}
        title={t("home.closing.title")}
        body={t("home.closing.body")}
        panelTitle={t("home.closing.panelTitle")}
        panelItems={t.raw("home.closing.panelItems") as string[]}
        cta={{
          primaryLabel: t("cta.primary"),
          whatsappLabel: t("cta.whatsapp"),
          whatsappPrefill: t("cta.waPrefill"),
        }}
      />
    </>
  );
}
