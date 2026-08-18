import { Eyebrow, Lead } from "./primitives";

export type VerticalItem = { name: string; body: string };

/**
 * P3 staggered-weight grid. The first card spans two columns and uses the
 * ink variant while the rest are hairline cards — this is the direct antidote
 * to a row of identical white boxes, and it also puts the primary vertical
 * where the eye lands first.
 *
 * The cards are deliberately not links: /soluciones/[vertical] is a later
 * step, and a card that looks clickable but isn't is worse than a card that
 * doesn't.
 */
export function VerticalCards({
  eyebrow,
  title,
  lead,
  items,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  items: VerticalItem[];
}) {
  return (
    <section className="mk-section" aria-labelledby="mk-verticals-title">
      <div className="mk-wrap">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id="mk-verticals-title">{title}</h2>
        <Lead>{lead}</Lead>

        <div className="mk-grid" style={{ marginTop: "3rem" }}>
          {items.map((item, index) => (
            <article
              key={item.name}
              data-reveal={index}
              className={
                index === 0
                  ? // The lead card spans two columns only when the row below
                    // it would be filled anyway. At exactly three items the
                    // span leaves two thirds of the second row empty, so the
                    // stagger comes from the ink variant alone.
                    `mk-card mk-card--ink mk-grain${items.length > 3 ? " mk-span-2" : ""}`
                  : "mk-card mk-card--hair"
              }
            >
              <h3>{item.name}</h3>
              <p style={{ marginBottom: 0 }}>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
