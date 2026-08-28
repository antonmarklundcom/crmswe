# Phase O3 — Channels, e-post & GDPR. Paste into a fresh OPUS session, ONLY after phase O2 is merged.

Read `plan.md` FIRST, in full — plus §9 build log and `KNOWN-ISSUES.md`. Execute
plan §5.3 under the autonomy protocol §4. Build nothing outside the plan.

Phase rules:
- Branch `phase/o3` off latest main. O2 unmerged ⇒ finish it first.
- Load skill: `sweden-business-apps` §5 (GDPR) before designing export/anonymize.
- WhatsApp is HIDDEN, not deleted: one tenant-settings feature flag, default
  off. Test both flag states — vendercrm cherry-picks depend on the code staying
  intact.
- Anonymization must NEVER destroy issued fakturor (7-year bokföringslag rule):
  scrub personal fields, keep the document; admin-confirmed + audit-logged.
- Email sending degrades gracefully without Resend keys (log driver, note in
  `.env.example`) — missing env never blocks (§4.5).
- Calendar sanity: week starts Monday, week numbers visible, `sv-SE` pickers.
- Re-runnable; minor issues → KNOWN-ISSUES.md; stop only per §4.4.

Exit: WA invisible with flag off / functional with flag on (both tested);
offert + faktura email flows work with public links; GDPR export returns
complete contact JSON; anonymization test proves invoices survive scrubbed;
suite green; PR merged.

## After this phase — hand off (MODEL SWITCH → Sonnet, fresh session)
Four gates (merged green, exit checklist, pre-handoff audit, build-log entry).
This is the last Opus phase. `create_session`: inherit env + permission mode
(never `plan`), **model = Sonnet**, prompt exactly
`Read prompts/sonnet-1-branding.md in this repo and execute it.`
Never Fable. No `create_session` → STOP and report: Anton must open a fresh
Sonnet window and paste that line.
