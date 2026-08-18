import { Eyebrow } from "./primitives";

export type FaqItem = { q: string; a: string };

/**
 * P4 editorial two-column, with native <details> so it works without any
 * JavaScript and stays keyboard-accessible for free. The FAQPage JSON-LD that
 * belongs alongside this is part of the later SEO step.
 */
export function Faq({
  eyebrow,
  title,
  items,
  id = "mk-faq-title",
}: {
  eyebrow?: string;
  title: string;
  items: FaqItem[];
  id?: string;
}) {
  return (
    <section className="mk-section" aria-labelledby={id}>
      <div className="mk-wrap mk-editorial">
        <div>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h2 id={id}>{title}</h2>
        </div>
        <div className="mk-faq">
          {items.map((item) => (
            <details key={item.q}>
              <summary data-ev="faq_open" data-ev-loc="faq">
                {item.q}
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
