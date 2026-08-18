import { Eyebrow, MarkedList } from "./primitives";

// P4 editorial two-column: heading in the left 4 columns, body and list in
// the right 7 with a gutter between. The measure cap keeps the body at 65ch
// no matter how wide the viewport gets.

export function ProblemSection({
  eyebrow,
  title,
  body,
  bodyTwo,
  symptomsTitle,
  symptoms,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bodyTwo: string;
  symptomsTitle: string;
  symptoms: string[];
}) {
  return (
    <section className="mk-section mk-section--surface" aria-labelledby="mk-problem-title">
      <div className="mk-wrap mk-editorial">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id="mk-problem-title">{title}</h2>
        </div>
        <div>
          <p>{body}</p>
          <p>{bodyTwo}</p>
          <h3 style={{ marginTop: "2rem" }}>{symptomsTitle}</h3>
          <MarkedList items={symptoms} />
        </div>
      </div>
    </section>
  );
}
