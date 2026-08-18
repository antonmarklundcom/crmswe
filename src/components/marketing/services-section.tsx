import { Eyebrow, Lead } from "./primitives";

export type ServiceItem = { name: string; body: string };

/**
 * What the business actually sells. Sits below the problem section, so the
 * page has established *why* before it lists *what* — the plan's messaging
 * hierarchy puts the outcome first and the services second, never the other
 * way round.
 *
 * Rendered as a hairline rail rather than cards: the verticals grid is a few
 * sections below, and two card grids on one page read as one repeated block.
 *
 * `fineprint` carries the money sentence — that ad spend is paid directly to
 * the platform, never through us. It answers the first objection an owner who
 * has been burned by an agency actually has, so it is on the homepage rather
 * than buried in an FAQ.
 */
export function ServicesSection({
  eyebrow,
  title,
  lead,
  items,
  fineprint,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  items: ServiceItem[];
  fineprint: string;
}) {
  return (
    <section className="mk-section mk-section--surface" aria-labelledby="mk-services-title">
      <div className="mk-wrap">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id="mk-services-title">{title}</h2>
        <Lead>{lead}</Lead>

        <div className="mk-services">
          {items.map((item, index) => (
            <article className="mk-service" key={item.name} data-reveal={index}>
              <h3>{item.name}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>

        <div className="mk-fineprint">
          <p>{fineprint}</p>
        </div>
      </div>
    </section>
  );
}
