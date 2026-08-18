// P8 full-bleed ribbon. Compresses the qualifying facts into a strip instead
// of another row of cards. Items are filtered by the caller, so a fact the
// owner hasn't supplied yet simply isn't in the list — the ribbon never
// renders an empty slot or a dangling separator.

export function TrustRibbon({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mk-ribbon mk-grain">
      <div className="mk-wrap mk-ribbon__inner">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}
