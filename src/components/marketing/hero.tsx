import { Eyebrow, Lead } from "./primitives";
import { CtaPair } from "./cta";

// P1 asymmetric split, 7/5. The aside panel is the visual weight while the
// imagery step is still pending — it carries real content (what the first
// conversation is), not a placeholder for a photo that isn't there yet.
//
// No entrance animation on any of this: it is above the fold, and animating
// it delays LCP and reads slow on a Paraguayan mobile connection.

export function Hero({
  eyebrow,
  title,
  lead,
  body,
  points,
  asideTitle,
  asideBody,
  asideNote,
  cta,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  body: string;
  points: string[];
  asideTitle: string;
  asideBody: string;
  asideNote: string;
  cta: { primaryLabel: string; whatsappLabel: string; whatsappPrefill: string };
}) {
  return (
    <section className="mk-section" aria-labelledby="mk-hero-title">
      <div className="mk-wrap mk-split">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 id="mk-hero-title">{title}</h1>
          <Lead>{lead}</Lead>
          <p>{body}</p>
          <ul className="mk-list">
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <CtaPair
            primaryLabel={cta.primaryLabel}
            whatsappLabel={cta.whatsappLabel}
            whatsappPrefill={cta.whatsappPrefill}
            location="hero"
          />
        </div>

        <aside className="mk-card mk-card--raised">
          <h2 className="mk-panel-title">{asideTitle}</h2>
          <p>{asideBody}</p>
          <p className="mk-meta" style={{ marginBottom: 0 }}>
            {asideNote}
          </p>
        </aside>
      </div>
    </section>
  );
}
