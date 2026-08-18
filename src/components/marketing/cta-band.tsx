import { Eyebrow, Lead, MarkedList } from "./primitives";
import { CtaPair } from "./cta";

/**
 * The page's one intentional overlap: a raised panel that crosses the
 * boundary into the dark closing band below it. The skill's P6 does this with
 * a full-bleed image; the imagery step hasn't run yet, so the overlap is
 * built from the panel and the ink field instead of shipping an empty image
 * slot.
 */
export function CtaBand({
  eyebrow,
  title,
  body,
  panelTitle,
  panelItems,
  cta,
}: {
  eyebrow: string;
  title: string;
  body: string;
  panelTitle: string;
  panelItems: string[];
  cta: { primaryLabel: string; whatsappLabel: string; whatsappPrefill: string };
}) {
  return (
    <>
      <div className="mk-wrap">
        <div className="mk-card mk-card--raised mk-overlap">
          <h3>{panelTitle}</h3>
          <MarkedList items={panelItems} />
        </div>
      </div>

      <section
        className="mk-section mk-section--ink mk-grain"
        aria-labelledby="mk-closing-title"
      >
        <div className="mk-wrap" style={{ paddingTop: "3rem" }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id="mk-closing-title">{title}</h2>
          <Lead>{body}</Lead>
          <CtaPair
            primaryLabel={cta.primaryLabel}
            whatsappLabel={cta.whatsappLabel}
            whatsappPrefill={cta.whatsappPrefill}
            location="cierre"
          />
        </div>
      </section>
    </>
  );
}
