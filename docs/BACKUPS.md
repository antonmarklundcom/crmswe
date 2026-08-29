# MySQL backup verification — Hostinger

VENDERCRM-PLAN.md §10 1H #5. Mostly a runbook — Hostinger's managed MySQL backups are
a hosting-panel feature, not something this app's code controls, so taking
and restoring a backup is done by hand. The part that *is* automated is the
judgement call at the end: `npm run verify-restore` (§2) decides whether a
restored database is a real restore, and says so with an exit code. Run this
check after initial launch and roughly monthly after that (put it on a
recurring reminder — see `docs/SMOKE_TEST.md` for the after-every-deploy
checks, this one is calendar-based instead).

## 1. Confirm backups are actually running

1. hPanel → **Databases** → the app's MySQL database → **Backups** (on some
   Hostinger plans this lives under Files → Backups instead, since backups
   can be plan-wide rather than per-database — check both).
2. Confirm:
   - A backup exists from within the last 24–48 hours.
   - The backup schedule/frequency matches the plan's stated SLA (daily on
     most Hostinger business plans — verify against the current plan, don't
     assume).
   - Backup size looks sane relative to the database's actual size (a
     near-zero-byte backup is a silent-failure red flag).

If Hostinger's automated backups aren't available on the current plan or
don't cover MySQL specifically, don't skip this — fall back to a manual
scheduled export instead (§3).

## 2. Verify a backup is actually restorable

An unverified backup is not a backup. Do this against a **throwaway
database**, never the production one:

1. hPanel → Databases → create a new, temporary database
   (`vendercrm_restore_test`).
2. Restore the most recent backup into it (hPanel's restore-to UI, or
   download the backup file and import manually via phpMyAdmin / `mysql`
   CLI if hPanel only supports in-place restore).
3. Run the checker against it — this is the spot-check, automated:

   ```
   RESTORE_DATABASE_URL='mysql://<user>:<pass>@<host>:<port>/vendercrm_restore_test' \
   npm run verify-restore
   ```

   It is read-only (nothing but `SELECT`s) and exits non-zero with a report
   naming every failed check, so it can be put on a schedule and its failure
   actually noticed. It asserts:
   - **Every table in the Drizzle schema exists.** The list comes from
     `src/db/schema` itself, so a table added by a later migration is covered
     the day it lands. A restore that stopped after the DDL, or one taken
     before the last migration, fails here.
   - **The tables a live CRM cannot have empty are populated** — `tenants`,
     `users`, `contacts`, `deals` by default. Row counts for every schema
     table are printed as the report's evidence, so an unexpected empty is
     visible even where no expectation was set.
   - **The newest `contacts`/`deals` row is recent enough** — 48h by default,
     measured against the restored server's own clock. This is the check that
     catches a stale dump wearing a fresh timestamp.

   Overrides, all optional: `RESTORE_MAX_AGE_HOURS` (default 48),
   `RESTORE_EXPECT_ROWS` and `RESTORE_FRESH_TABLES` (comma-separated table
   lists), and `RESTORE_ALLOW_PRODUCTION_URL=1` to bypass the guard that
   refuses to run when `RESTORE_DATABASE_URL` points at the same database as
   `DATABASE_URL` — verifying the live database proves nothing about the
   backup, and is the easy mistake to make with both URLs in one shell.

   Exit codes: `0` all checks passed, `1` a check failed, `2` the script
   could not run (missing/invalid config, or the database was unreachable).
4. Drop the temporary database once verified.

## 3. Manual fallback export (if automated backups are unavailable/unverified)

Run from a local machine against the external MySQL host (see
`docs/DEPLOY.md` §2–3 for how to get remote access enabled):

```
mysqldump -h <external-host> -u <user> -p <dbname> \
  --single-transaction --routines --triggers \
  > vendercrm-backup-$(date +%F).sql
```

`--single-transaction` avoids locking tables on a live database (MySQL 8,
InnoDB — this schema uses InnoDB by default via Drizzle/mysql2). Store the
dump somewhere outside Hostinger itself (a separate cloud storage bucket,
not the same disk) — a host-level incident should not be able to take out
both the database and its only backup.

## 4. What "restorable" needs to mean before external tenants are onboarded

The check in §2 is enough for the owner's own tenant during the internal
launch period. Before onboarding tenants beyond the owner's own business,
tighten this to:

- A documented, tested point-in-time restore procedure (not just "latest
  backup restores").
- A defined RPO/RTO (how much data loss and downtime is acceptable) —
  currently undefined; Hostinger's default backup cadence is whatever it is
  until this is explicitly decided.
- Off-host backup storage confirmed working (§3's manual export, or
  Hostinger's off-host option if the plan includes one), not just Hostinger's
  own backup feature — a single point of failure at the host level would
  otherwise take out both the app and its only backups.
