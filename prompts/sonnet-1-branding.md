# Phase S1 — Branding & UI sweep. Paste into a fresh SONNET session, ONLY after phase O3 is merged.

Read `plan.md` FIRST, in full — plus §9 build log and `KNOWN-ISSUES.md`. Execute
plan §6.1 under the autonomy protocol §4. Build nothing outside the plan.

HARD LIMITS (protocol §4.7): no schema, auth, money-math or moms-logic changes.
Data access only through existing module query layers. Blocked by a foundation
issue ⇒ workaround + Backlog note, never a foundation edit.

Phase rules:
- Branch `phase/s1` off latest main. O3 unmerged ⇒ finish it first.
- All brand values flow through `src/lib/site-config.ts` (split infra constants
  from content; hosts read from env). Placeholder brand "CRM Swe" per plan §1.14
  unless §7 shows Anton supplied the real name/domain.
- i18n edits keep the three-locale parity test green; sv is reference.
- Keep redirects for any renamed public slug.
- Finish with the exit grep — it is the phase's acceptance test, not a formality.
- Re-runnable; minor issues → KNOWN-ISSUES.md; stop only per §4.4.

Exit: `rg -i "clientes\.com\.py|vendercrm|PYG|Asunción|guaraní"` across src/,
public/, messages/ hits only deliberate legacy handling and
docs/VENDERCRM-PLAN.md; Swedish UI walkthrough clean; build green; PR merged.

## After this phase — hand off (fresh session)
Four gates (merged green, exit checklist, pre-handoff audit, build-log entry).
`create_session`: inherit env + permission mode (never `plan`), model = Sonnet,
prompt exactly `Read prompts/sonnet-2-marketing.md in this repo and execute it.`
Never Fable. No `create_session` → continue in this window (same model).
