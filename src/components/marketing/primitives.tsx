import type { ReactNode } from "react";

// Layout primitives for the marketing site. Everything renders plain
// class names from the `.mk` block in globals.css rather than Tailwind
// utilities, so the marketing design tokens stay in one reviewable place
// and can't drift into app components by copy-paste.

type Tone = "base" | "surface" | "ink";

const TONE_CLASS: Record<Tone, string> = {
  base: "",
  surface: "mk-section--surface",
  // Every dark section carries grain — the cheapest depth available, and it
  // keeps large ink fields from reading as flat colour.
  ink: "mk-section--ink mk-grain",
};

export function Section({
  children,
  tone = "base",
  tight = false,
  id,
  labelledBy,
}: {
  children: ReactNode;
  tone?: Tone;
  tight?: boolean;
  id?: string;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`mk-section ${tight ? "mk-section--tight" : ""} ${TONE_CLASS[tone]}`}
    >
      <div className="mk-wrap">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="mk-eyebrow">{children}</span>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="mk-lead">{children}</p>;
}

export function MarkedList({ items }: { items: string[] }) {
  return (
    <ul className="mk-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
