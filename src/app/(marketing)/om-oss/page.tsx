import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Eyebrow, Lead } from "@/components/marketing/primitives";
import { VerticalCards, type VerticalItem } from "@/components/marketing/vertical-cards";
import { Statement } from "@/components/marketing/statement";
import { CtaBand } from "@/components/marketing/cta-band";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.omOss.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/om-oss" },
  };
}

export default async function OmOssPage() {
  const t = await getTranslations("marketing");

  // Pattern map: header P2 offset · story P4 editorial · principles P3
  // staggered grid · statement P9 · closing overlap + ink band.
  return (
    <>
      <section className="mk-section" aria-labelledby="mk-omoss-title">
        <div className="mk-wrap mk-offset">
          <Eyebrow>{t("omOss.header.eyebrow")}</Eyebrow>
          <h1 id="mk-omoss-title">{t("omOss.header.title")}</h1>
          <Lead>{t("omOss.header.lead")}</Lead>
        </div>
      </section>

      <section className="mk-section mk-section--surface" aria-labelledby="mk-story-title">
        <div className="mk-wrap mk-editorial">
          <div>
            <Eyebrow>{t("omOss.story.eyebrow")}</Eyebrow>
            <h2 id="mk-story-title">{t("omOss.story.title")}</h2>
          </div>
          <div>
            <p>{t("omOss.story.body")}</p>
            <p>{t("omOss.story.bodyTwo")}</p>
            <p>{t("omOss.story.bodyThree")}</p>
          </div>
        </div>
      </section>

      <VerticalCards
        eyebrow={t("omOss.principles.eyebrow")}
        title={t("omOss.principles.title")}
        lead={t("omOss.principles.lead")}
        items={
          (t.raw("omOss.principles.items") as Array<{ title: string; body: string }>).map(
            (item): VerticalItem => ({ name: item.title, body: item.body }),
          )
        }
      />

      <Statement text={t("omOss.statement.text")} sub={t("omOss.statement.sub")} />

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
