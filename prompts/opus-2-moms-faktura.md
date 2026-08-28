# Phase O2 — Moms & faktura engine. Paste into a fresh OPUS session, ONLY after phase O1 is merged.

Read `plan.md` FIRST, in full — plus §9 build log and `KNOWN-ISSUES.md`. Execute
plan §5.2 under the autonomy protocol §4. Build nothing outside the plan.

Phase rules:
- Branch `phase/o2` off latest main. O1 unmerged ⇒ finish it first.
- Load skill: `sweden-business-apps` — §1 (fakturans anatomi) is the legal
  checklist for §5.2.3; implement every listed mandatory field.
- Moms rounding is the trap: define ONE rule (round per line, total = sum of
  rounded lines), document it in code, and property-test that netto + moms =
  brutto with zero öre drift across mixed-rate documents.
- Issued documents are immutable and sequences unbroken — corrections ONLY via
  kreditfaktura. Write the test that proves no mutation path exists.
- The tenant-locale translator pattern (`src/lib/i18n/translator.ts`) governs
  PDFs and public pages — customer sees tenant locale, not viewer locale.
- New i18n keys go into all three locales (sv is reference; parity test enforces).
- Re-runnable; minor issues → KNOWN-ISSUES.md; stop only per §4.4.

Exit: mixed-rate (25+12+6) faktura renders correctly in PDF + `/d/[token]` with
per-rate moms summary, OCR and F-skatt line; kreditfaktura round-trip test
passes; immutability test passes; suite green; PR merged.

## After this phase — hand off (fresh session)
Four gates (merged green, exit checklist, pre-handoff audit, build-log entry).
Then `create_session`: inherit env + permission mode (never `plan`), model =
Opus, prompt exactly
`Read prompts/opus-3-channels-gdpr.md in this repo and execute it.`
Never Fable. No `create_session` → continue in this window.
