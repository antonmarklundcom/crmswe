import Link from "next/link";
import { Eyebrow, Lead, MarkedList } from "./primitives";

export type MethodStep = {
  title: string;
  body: string;
  lead?: string;
  points?: string[];
};

/**
 * P5 numbered process rail — four across on desktop, a vertical rail on
 * mobile, with the oversized step number sitting behind the text at 20%
 * accent. Used as the method teaser on the homepage.
 */
export function MethodRail({
  eyebrow,
  title,
  lead,
  steps,
  link,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  steps: MethodStep[];
  link?: { href: string; label: string };
}) {
  return (
    <section className="mk-section mk-section--ink mk-grain" aria-labelledby="mk-method-title">
      <div className="mk-wrap">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id="mk-method-title">{title}</h2>
        <Lead>{lead}</Lead>

        <div className="mk-rail" style={{ marginTop: "3rem" }}>
          {steps.map((step, index) => (
            <div className="mk-step" key={step.title} data-reveal={index}>
              <span className="mk-step__n" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>

        {link ? (
          <p style={{ marginTop: "2rem", marginBottom: 0 }}>
            <Link href={link.href} className="mk-btn mk-btn--ghost">
              {link.label}
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * P7 sticky-side scroll — the heading holds still in the left column while
 * the four expanded steps scroll past on the right. This is the plan's
 * "scroll-triggered method steps" on /sa-funkar-det: the reveal is the only motion,
 * and it is off entirely under `prefers-reduced-motion`.
 */
export function MethodDetail({
  eyebrow,
  title,
  steps,
}: {
  eyebrow: string;
  title: string;
  steps: MethodStep[];
}) {
  return (
    <section className="mk-section mk-section--surface" aria-labelledby="mk-method-detail-title">
      <div className="mk-wrap mk-sticky-side">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id="mk-method-detail-title">{title}</h2>
        </div>

        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "3rem" }}>
          {steps.map((step, index) => (
            <li key={step.title} data-reveal={index}>
              <div className="mk-step" style={{ paddingTop: "2rem" }}>
                <span className="mk-step__n" aria-hidden="true">
                  {index + 1}
                </span>
                <h3>{step.title}</h3>
                {step.lead ? <Lead>{step.lead}</Lead> : null}
                <p>{step.body}</p>
                {step.points ? <MarkedList items={step.points} /> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
