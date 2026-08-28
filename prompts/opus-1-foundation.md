# Phase O1 — Money & schema foundation. Paste into a fresh OPUS session.

Read `plan.md` FIRST, in full — plus §9 build log and `KNOWN-ISSUES.md` (create if
missing). Execute plan §5.1 under the autonomy protocol §4. Build nothing outside
the plan.

Phase rules:
- Branch `phase/o1` off latest main.
- FIRST COMMIT: `git mv PLAN.md docs/VENDERCRM-PLAN.md` (case-collision hazard
  with plan.md on Windows/macOS checkouts — do this before anything else).
- Load skills: `sweden-business-apps` (identity/money rules), then
  `nodejs-mysql-hostinger-stack` if touching Drizzle migration mechanics.
- The öre semantics change (§5.1.2) is the trap: audit EVERY money format/parse/
  aggregate path, including CSV import, search parsing, and reports — a missed
  path shows amounts 100× off. Write a grep-driven checklist first.
- Write the COMPLETE schema delta (§5.1.5) even though O2/O3 use most of it.
  Schema is never retrofitted.
- Never hardcode tax rates — `vat_rates` config rows with source + validity date.
- Re-runnable; minor issues → KNOWN-ISSUES.md; stop only per §4.4.

Exit: build/typecheck/tests green incl. MySQL migrations in CI; org.nr + OCR
validators unit-tested; seeded dev tenant shows `12 500,00 kr` style everywhere;
no stray `"PYG"` literals; PR merged.

## After this phase — hand off (fresh session)
Four gates: PR merged green; exit checklist passed; pre-handoff audit (re-run
build+tests, adversarially re-read your merged diff, fix findings); build-log
entry in plan §9 committed. Then `create_session` (claude-code-remote): inherit
env + permission mode (never `plan`), model = Opus, prompt exactly
`Read prompts/opus-2-moms-faktura.md in this repo and execute it.`
Never Fable. No `create_session` available → continue in this window.
