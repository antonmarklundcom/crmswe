# Phase S2 — Swedish marketing site. Paste into a fresh SONNET session, ONLY after phase S1 is merged.

Read `plan.md` FIRST, in full — plus §9 build log and `KNOWN-ISSUES.md`. Execute
plan §6.2 under the autonomy protocol §4. Build nothing outside the plan.

HARD LIMITS (protocol §4.7): no schema, auth, money-math or moms-logic changes;
marketing pages + marketing components + i18n marketing namespace only.

Phase rules:
- Branch `phase/s2` off latest main. S1 unmerged ⇒ finish it first.
- Load skills: `nextjs-national-lead-gen` + `web-design-system` before writing
  pages; `higgsfield-web-imagery` ONLY if image slots are declared and empty.
- Positioning per plan §6.2: e-post-first Swedish SMB CRM with offert + faktura.
  WhatsApp is never mentioned. Pricing copy "kr/mån exkl. moms".
- Dogfood: the contact form posts through the app's own `/api/v1/leads` lane
  into a seeded tenant (see skill `vendercrm-lead-capture` pattern).
- GDPR-granular cookie banner, consent unchecked by default.
- Swedish copy in du-form; no fabricated claims, prices or customer counts —
  placeholders marked for Anton where §7 inputs are missing.
- Re-runnable; minor issues → KNOWN-ISSUES.md; stop only per §4.4.

Exit: all marketing routes render in Swedish (`/`, `/sa-funkar-det`, `/om-oss`,
`/kontakt`); lead form creates a contact + deal end-to-end; Swedish metadata/OG;
no console errors; build green; PR merged.

## After this phase — hand off (fresh session)
Four gates (merged green, exit checklist, pre-handoff audit, build-log entry).
`create_session`: inherit env + permission mode (never `plan`), model = Sonnet,
prompt exactly `Read prompts/sonnet-3-deploy.md in this repo and execute it.`
Never Fable. No `create_session` → continue in this window (same model).
