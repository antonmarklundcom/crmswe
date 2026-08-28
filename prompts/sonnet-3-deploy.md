# Phase S3 — Deploy & launch checks. Paste into a fresh SONNET session, ONLY after phase S2 is merged.

Read `plan.md` FIRST, in full — plus §9 build log and `KNOWN-ISSUES.md`. Execute
plan §6.3 under the autonomy protocol §4. Build nothing outside the plan.

HARD LIMITS (protocol §4.7): no schema, auth, money-math or moms-logic changes.
Deployment, env, docs, and smoke fixes only.

Phase rules:
- Branch `phase/s3` off latest main. S2 unmerged ⇒ finish it first.
- Load skill `nextjs-deploy-hostinger` FIRST and follow it exactly — it carries
  the verified fixes (Remote MySQL whitelisting, SSH npm PATH, env var traps).
- Check plan §7: Hostinger slot, domain, MySQL and Resend inputs come from
  Anton. Missing ⇒ do everything possible (env docs, build verification, deploy
  scripts), then STOP and ask per §4.4 — a missing credential is the one valid
  blocker.
- Generate FRESH `APP_ENCRYPTION_KEY` / `BETTER_AUTH_SECRET` / `CRON_SECRET` —
  never reuse vendercrm's.
- Run the full smoke checklist from §6.3 against production and record results
  in the build log.
- Re-runnable; minor issues → KNOWN-ISSUES.md.

Exit: production URL serves app + marketing; migrations applied; smoke checklist
green and logged; `docs/DEPLOY.md` updated; PR merged.

## After this phase — STOP. Final phase.
Four gates, then write the closing report to Anton in the session: live URLs,
full checklist status, KNOWN-ISSUES.md summary, and exact numbered manual steps
remaining from plan §7. Do NOT spawn further sessions. Suggest creating a
`crmswe-dev` project skill (schema, routes, guardrails) once live and stable.
