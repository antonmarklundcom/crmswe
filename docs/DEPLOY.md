# Deploy runbook — Hostinger

VenderCRM runs as a single Next.js app on Hostinger's managed Node.js hosting
(PLAN.md §2.1: one process, no Redis, no separate worker dyno — the job
queue worker starts in-process from `instrumentation.ts`). This doc covers a
first deploy and every routine redeploy after it.

## 1. One-time setup

1. **hPanel → Websites → Add Website → Node.js Apps → Import Git Repository.**
   Authorize GitHub, select this repo and the branch to deploy (`main`).
2. Verify auto-detected settings: framework Next.js, build command
   `npm run build`, start command `npm start`.
3. **Create the MySQL database** (hPanel → Databases → MySQL Databases) if it
   doesn't exist yet. Note the internal host (usually `localhost`), db name,
   user, password.
4. **Environment variables** — add all of these in hPanel (never commit
   secrets; `.env.example` documents each one):
   - `NODE_ENV=production`
   - `DATABASE_URL` — use the **internal** `localhost`/`127.0.0.1` host for
     the live app, not the external `srv####.hstgr.io` host (that's only for
     remote/local connections, see §3 below)
   - `APP_ENCRYPTION_KEY` — 32-byte hex, generate with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `APP_URL` — the final deployed URL (Hostinger subdomain or custom domain)
   - `STORAGE_DRIVER` / `STORAGE_LOCAL_PATH` — leave as `local`. Setting
     `s3` throws at boot: the R2 driver isn't written yet
     (`src/lib/storage/index.ts`, PLAN.md §2.1), so no Cloudflare account is
     needed to launch. What `local` costs today is only that stored quote
     PDFs don't survive a redeploy — the public quote route re-renders them
     on demand, so nothing is actually lost. Write the S3 driver before
     onboarding tenants beyond the owner's own.
   - `CRON_SECRET` — arbitrary long random string, shared with the Hostinger
     cron job set up in §5
   - `BETTER_AUTH_SECRET` — >=32 chars, generate the same way as the
     encryption key
   - `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — from the Meta
     developer app (PLAN.md §6.1)
   - `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production` —
     optional; leave unset to run without error tracking
   - `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — optional, only
     needed to upload source maps at build time
5. **Deploy** once so the app and its build exist, then map the custom
   domain (hPanel → domain mapping on the app, SSL is automatic). Update
   `APP_URL` to match once the domain is live, then redeploy.

## 2. Running migrations

Run migrations from a **local machine**, not Hostinger SSH — see §3 for why.

1. hPanel → Databases → **Remote MySQL** → add your current public IP.
2. Get the external host/port shown on that same page (different from the
   app's internal `localhost` connection).
3. Set `DATABASE_URL` for your local shell to that external host/port, then:
   ```
   npx drizzle-kit migrate
   ```
4. First deploy only — seed the owner's real tenant (PLAN.md §10 1H #1):
   ```
   TENANT_NAME="..." TENANT_SLUG=... TENANT_ADMIN_EMAIL=... \
   TENANT_ADMIN_PASSWORD=... TENANT_ADMIN_NAME="..." \
   npx tsx scripts/seed-tenant.ts
   ```
   Safe to re-run later (e.g. to reset the admin password) — see the script
   header. Bootstrap a platform superadmin the same way with
   `npm run create-superadmin -- <email> <password> <name>` if one doesn't
   exist yet.

Every subsequent deploy that adds a migration: repeat step 3 against the
external host **before** or immediately after the code deploy — this app
doesn't run migrations automatically on boot.

## 3. Why not run migrations via Hostinger SSH

Hostinger's shared servers have a documented history of broken IPv6 routing
to external DB endpoints; even though this is Hostinger's own MySQL (not an
external provider like Neon), the safer, verified path is to keep one-off DB
commands on a local machine (IPv4) rather than debugging it fresh on every
deploy. If SSH is used anyway: `npm`/`npx` aren't on the default PATH —
`export PATH=/opt/alt/alt-nodejsNN/root/usr/bin:$PATH` first (match the
installed Node version under `/opt/alt/`).

## 4. Point Meta's webhook at the app

Required before inbound WhatsApp works at all — outbound sending needs only
the per-tenant token, but nothing arrives in the Inbox until this is set.
One endpoint serves every tenant; Meta routes by `phone_number_id`
(PLAN.md §6.3), so this is configured once per Meta app, not per tenant.

1. Meta developer app → **WhatsApp → Configuration → Webhook → Edit**.
2. Callback URL: `https://<app-domain>/api/webhooks/whatsapp`
3. Verify token: the exact `WHATSAPP_WEBHOOK_VERIFY_TOKEN` value set in
   hPanel. Meta immediately GETs the URL with a challenge and expects it
   echoed back — a mismatch (or an app that hasn't been restarted since the
   env var was added) fails verification with a 403.
4. Subscribe the app to the **`messages`** webhook field.
5. Confirm `WHATSAPP_APP_SECRET` in hPanel matches the Meta app's secret —
   POSTs are rejected with 401 on a signature mismatch, which looks
   identical to "no messages arriving" from the UI.

Meta pauses a subscription that keeps failing, so re-check this after any
domain change. `docs/SMOKE_TEST.md` §2 verifies inbound delivery end-to-end.

## 5. Cron fallback (worker safety net)

The job queue worker ticks in-process every ~2s via `instrumentation.ts`
(§2.1: "no cron guarantees" on Hostinger, hence a fallback, not the primary
mechanism). Set up an external cron (Hostinger's own cron jobs, or any free
uptime/cron pinger) to hit:

```
GET https://<app-domain>/api/cron/tick
Header: x-cron-secret: <CRON_SECRET>
```

Every 1–5 minutes is plenty — it just processes one due job per call as a
backstop if the in-process loop ever stalls. It also indirectly keeps the
`webhook_events` pruning chain (PLAN.md §10 1H #3) alive if the worker loop
itself isn't running for some reason, since a stalled worker means both the
regular loop and the pruning chain are stuck at the same time.

## 6. Process restart

hPanel → the app → **Restart**. Required after any environment variable
change (redeploy also restarts it; editing env vars alone does not take
effect until a restart/redeploy). The in-process worker restarts
automatically with the app — no separate process to manage.

## 7. Rollback

1. hPanel → the app → **Deployments** (or Git tab) → redeploy a previous
   commit/build. Hostinger's Node.js apps keep recent build history for
   this.
2. If the bad deploy included a migration that needs reverting: check
   `drizzle/` for the corresponding down migration, or, given how young this
   schema is, prefer a forward-fixing migration over an automatic down —
   Drizzle Kit doesn't auto-generate downs, and this schema has no data
   migrations complex enough yet to make a manual down risky to write.
3. After rolling back code, verify `DATABASE_URL` and the other env vars in
   hPanel still match what the rolled-back build expects (a schema/env drift
   between them is the usual cause of a rollback still crashing).
4. Confirm with `docs/SMOKE_TEST.md` before calling the rollback done.

## 8. Diagnosing a blank HTTP 500

In production Next.js returns an empty 500 body for any unhandled error, and
the login form shows one generic "wrong credentials" message no matter what
actually failed — so a broken database connection and a wrong password look
identical from the browser. Ask the app directly instead:

```
curl -s -i -H "x-cron-secret: <CRON_SECRET>" https://<app-domain>/api/health/db
```

- `200 {"ok":true,...}` — the app can reach MySQL; the 500 is elsewhere.
- `503` with `"code":"ER_ACCESS_DENIED_ERROR"` — credentials/grant problem.
  Check the reported `target.host`/`target.user`/`target.database` against
  hPanel; note the app connects over the **internal** host, whose MySQL grant
  is separate from the Remote MySQL allowlist used for migrations, so
  changing the password in one place does not necessarily fix the other. If
  the user shows as `'user'@'::1'` in the server log, see below.
- `503` with `ECONNREFUSED` — wrong host/port.
- `401` — `CRON_SECRET` in hPanel doesn't match what you sent.

**`Access denied for user '...'@'::1'`**: Node 18+ resolves `localhost` to
the IPv6 loopback `::1`, which Hostinger's grant (`@localhost`/`@127.0.0.1`)
doesn't cover. `src/db/url.ts` now rewrites a `localhost` (or `[::1]`) host
in `DATABASE_URL` to `127.0.0.1` at pool creation, so a deploy of this code
fixes it without an env change; setting `DATABASE_URL` to `127.0.0.1`
directly is equivalent.

## 9. Post-deploy checklist

- [ ] App loads at the deployed URL over HTTPS
- [ ] Login works with real (not seed-default) admin credentials
- [ ] `docs/SMOKE_TEST.md` passes
- [ ] `/api/cron/tick` returns 401 without the header and 200 with it
- [ ] Meta webhook shows as verified and subscribed to `messages` (§4)
- [ ] Sentry (if configured) shows the deploy's release/environment
