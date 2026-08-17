/**
 * Styles for the marketing site, scoped under `.mkt`.
 *
 * Deliberately plain CSS in one string rather than Tailwind classes: this page
 * shares a document with the CRM, whose globals.css defines its own token set
 * (--background, --primary, …). Scoping here means the marketing palette and
 * the app palette can never bleed into each other.
 */
export const marketingCss = `
.mkt {
  --ink: #0B2545;
  --ink-soft: #4A5C75;
  --accent: #2EC4B6;
  --card: #F5F7FA;
  --line: #E4E9F0;
  --shell: #FFFFFF;

  background: var(--shell);
  color: var(--ink);
  font-family: var(--mkt-font-body), system-ui, sans-serif;
  font-size: 17px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.mkt * { box-sizing: border-box; }
.mkt h1, .mkt h2, .mkt h3 {
  font-family: var(--mkt-font-heading), system-ui, sans-serif;
  letter-spacing: -0.02em;
  line-height: 1.15;
  margin: 0;
}
.mkt p { margin: 0; }
.mkt a { color: inherit; }

.mkt-wrap { width: 100%; max-width: 1100px; margin: 0 auto; padding: 0 20px; }
.mkt-narrow { max-width: 720px; }
.mkt-center { text-align: center; }

/* Header */
.mkt-header { border-bottom: 1px solid var(--line); background: var(--shell); }
.mkt-header-in {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 64px;
}
.mkt-logo { font-family: var(--mkt-font-heading), sans-serif; font-weight: 700; font-size: 19px; }
.mkt-link { font-weight: 500; font-size: 15px; text-decoration: none; color: var(--ink-soft); }
.mkt-link:hover { color: var(--ink); }

/* Hero */
.mkt-hero { padding: 56px 0 48px; }
.mkt-h1 { font-weight: 700; font-size: clamp(2.1rem, 7vw, 3.6rem); max-width: 16ch; }
.mkt-lead {
  margin-top: 20px; font-size: 18px; color: var(--ink-soft); max-width: 60ch;
}
.mkt-cta-row {
  margin-top: 32px; display: flex; flex-direction: column; gap: 12px;
}
.mkt-note { margin-top: 16px; font-size: 14px; color: var(--ink-soft); }

/* The accent colour appears on the primary CTA and nowhere else. */
.mkt-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 52px; padding: 0 28px;
  background: var(--accent); color: #04231F;
  font-weight: 600; font-size: 17px; text-decoration: none;
  border: 0; border-radius: 10px; cursor: pointer;
  transition: transform 180ms ease-out, filter 180ms ease-out;
}
.mkt-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
.mkt-btn-block { width: 100%; }
.mkt-btn-ghost {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 52px; padding: 0 24px;
  border: 1px solid var(--line); border-radius: 10px;
  font-weight: 500; text-decoration: none; color: var(--ink);
  transition: border-color 180ms ease-out;
}
.mkt-btn-ghost:hover { border-color: var(--ink-soft); }

/* Trust strip */
.mkt-strip { background: var(--card); border-block: 1px solid var(--line); }
.mkt-strip-in {
  display: grid; grid-template-columns: 1fr; gap: 20px; padding: 28px 20px;
}
.mkt-strip-in div { display: flex; flex-direction: column; }
.mkt-strip-in strong { font-weight: 600; }
.mkt-strip-in span { font-size: 15px; color: var(--ink-soft); }

/* Sections */
.mkt-section { padding: 64px 0; }
.mkt-section-alt { background: var(--card); }
.mkt-h2 { font-weight: 600; font-size: clamp(1.7rem, 4.5vw, 2.4rem); }
.mkt-h2-light { font-weight: 600; font-size: clamp(1.7rem, 4.5vw, 2.4rem); color: #fff; }
.mkt-sub { margin-top: 14px; color: var(--ink-soft); max-width: 62ch; }
.mkt-price { margin-top: 14px; font-size: 20px; }

/* Bento — single-column order defined first, grid composed from it. */
.mkt-bento { margin-top: 32px; display: grid; grid-template-columns: 1fr; gap: 14px; }
.mkt-cell {
  background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  padding: 24px; transition: transform 200ms ease-out;
}
.mkt-cell:hover { transform: scale(1.02); }
.mkt-cell h3 { font-size: 19px; font-weight: 600; }
.mkt-cell p { margin-top: 10px; color: var(--ink-soft); font-size: 16px; }

/* Steps */
.mkt-steps {
  margin: 32px 0 0; padding: 0; list-style: none;
  display: grid; grid-template-columns: 1fr; gap: 24px;
}
.mkt-steps li {
  background: var(--shell); border: 1px solid var(--line);
  border-radius: 14px; padding: 24px;
}
.mkt-step-n {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 999px;
  background: var(--ink); color: #fff; font-weight: 600; font-size: 15px;
  margin-bottom: 14px;
}
.mkt-steps h3 { font-size: 18px; font-weight: 600; }
.mkt-steps p { margin-top: 8px; color: var(--ink-soft); font-size: 16px; }
.mkt-steps + .mkt-center { margin-top: 36px; }

/* FAQ */
.mkt-faq { margin-top: 28px; display: grid; gap: 10px; }
.mkt-faq details {
  background: var(--shell); border: 1px solid var(--line);
  border-radius: 12px; padding: 18px 20px;
}
.mkt-faq summary {
  cursor: pointer; font-weight: 600; list-style: none;
}
.mkt-faq summary::-webkit-details-marker { display: none; }
.mkt-faq summary::after { content: " +"; color: var(--ink-soft); }
.mkt-faq details[open] summary::after { content: " –"; }
.mkt-faq p { margin-top: 12px; color: var(--ink-soft); }

/* Form */
.mkt-form { margin-top: 28px; display: grid; gap: 16px; }
.mkt-form label { display: grid; gap: 6px; font-size: 15px; font-weight: 500; }
.mkt-form input, .mkt-form select, .mkt-form textarea {
  width: 100%; min-height: 48px; padding: 12px 14px;
  border: 1px solid var(--line); border-radius: 10px;
  background: var(--shell); color: var(--ink);
  font: inherit; font-size: 16px;
}
.mkt-form textarea { min-height: 110px; resize: vertical; }
.mkt-form input:focus, .mkt-form select:focus, .mkt-form textarea:focus {
  outline: 2px solid var(--ink); outline-offset: 1px; border-color: transparent;
}
.mkt-hp { position: absolute; left: -9999px; width: 1px; height: 1px; }

/* Final CTA */
.mkt-final { background: var(--ink); color: #fff; padding: 64px 0; }
.mkt-final p { margin: 14px 0 28px; color: #C3D0E2; }

/* Footer */
.mkt-footer { border-top: 1px solid var(--line); padding: 28px 0; font-size: 14px; color: var(--ink-soft); }
.mkt-footer-in { display: flex; flex-direction: column; gap: 12px; }
.mkt-footer-links { display: flex; flex-wrap: wrap; gap: 16px; }

/* Sticky mobile CTA */
.mkt-sticky {
  position: fixed; left: 16px; right: 16px; bottom: 16px; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  min-height: 54px; border-radius: 12px;
  background: var(--accent); color: #04231F;
  font-weight: 600; text-decoration: none;
  box-shadow: 0 8px 24px rgba(11, 37, 69, 0.18);
}
.mkt-sticky:hover { filter: brightness(1.06); }
body:has(.mkt) { padding-bottom: 86px; }

@media (min-width: 700px) {
  .mkt-cta-row { flex-direction: row; }
  .mkt-strip-in { grid-template-columns: repeat(3, 1fr); }
  .mkt-bento { grid-template-columns: repeat(2, 1fr); }
  .mkt-cell-wide { grid-column: span 2; }
  .mkt-steps { grid-template-columns: repeat(3, 1fr); }
  .mkt-footer-in { flex-direction: row; align-items: center; justify-content: space-between; }
  .mkt-hero { padding: 88px 0 72px; }
  .mkt-section { padding: 96px 0; }
  .mkt-sticky { display: none; }
  body:has(.mkt) { padding-bottom: 0; }
}

/* One reveal, pure CSS, no library and no client JS. Browsers without
   scroll-driven animation support simply show the content. */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .mkt-cell, .mkt-steps li, .mkt-faq details {
      animation: mkt-rise linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 40%;
    }
    @keyframes mkt-rise {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: none; }
    }
  }
}
`;
