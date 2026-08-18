import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Eyebrow, Lead } from "@/components/marketing/primitives";
import { VerticalCards, type VerticalItem } from "@/components/marketing/vertical-cards";
import { Statement } from "@/components/marketing/statement";
import { CtaBand } from "@/components/marketing/cta-band";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.nosotros.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/nosotros" },
  };
}

export default async function NosotrosPage() {
  const t = await getTranslations("marketing");

  // Pattern map: header P2 offset · story P4 editorial · principles P3
  // staggered grid · statement P9 · closing overlap + ink band.
  return (
    <>
      <section className="mk-section" aria-labelledby="mk-nosotros-title">
        <div className="mk-wrap mk-offset">
          <Eyebrow>{t("nosotros.header.eyebrow")}</Eyebrow>
          <h1 id="mk-nosotros-title">{t("nosotros.header.title")}</h1>
          <Lead>{t("nosotros.header.lead")}</Lead>
        </div>
      </section>

      <section className="mk-section mk-section--surface" aria-labelledby="mk-story-title">
        <div className="mk-wrap mk-editorial">
          <div>
            <Eyebrow>{t("nosotros.story.eyebrow")}</Eyebrow>
            <h2 id="mk-story-title">{t("nosotros.story.title")}</h2>
          </div>
          <div>
            <p>{t("nosotros.story.body")}</p>
            <p>{t("nosotros.story.bodyTwo")}</p>
            <p>{t("nosotros.story.bodyThree")}</p>
          </div>
        </div>
      </section>

      <VerticalCards
        eyebrow={t("nosotros.principles.eyebrow")}
        title={t("nosotros.principles.title")}
        lead={t("nosotros.principles.lead")}
        items={
          (t.raw("nosotros.principles.items") as Array<{ title: string; body: string }>).map(
            (item): VerticalItem => ({ name: item.title, body: item.body }),
          )
        }
      />

      <Statement text={t("nosotros.statement.text")} sub={t("nosotros.statement.sub")} />

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
