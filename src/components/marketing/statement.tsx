// P9 oversized statement. One line, alone in its section, with a short
// sub-line and nothing else — the page's one "expensive" moment. Exactly one
// per page, never two.

export function Statement({ text, sub }: { text: string; sub: string }) {
  return (
    <section className="mk-section">
      <div className="mk-wrap mk-offset">
        <p className="mk-statement">{text}</p>
        <p className="mk-lead" style={{ marginBottom: 0 }}>
          {sub}
        </p>
      </div>
    </section>
  );
}
