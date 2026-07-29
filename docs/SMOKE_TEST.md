# Smoke-test checklist

Manual verification to run after every production deploy (PLAN.md §10 1H
#7). Each section maps to a phase's exit criteria — see PLAN.md for the
full context on any item. Use the owner's real tenant/WhatsApp number for
this, not a throwaway one, since 1D's inbound/outbound checks need a real
Meta connection.

## 0. Basics

- [ ] App loads over HTTPS at the production domain
- [ ] Login works with real (non-seed-default) credentials
- [ ] Superadmin console loads (`/superadmin` or equivalent nav entry) for
      the superadmin account

## 1. Core CRM lifecycle (1C exit)

- [ ] Submit the public form at `/f/[tenantSlug]/[formSlug]` for a real
      tenant form
- [ ] A contact is created (or matched by phone, if resubmitting) —
      check Contacts
- [ ] A deal is created on the form's target pipeline/stage
- [ ] Drag the deal across the kanban board — stage change persists on
      reload
- [ ] Contact's timeline shows the form submission and the stage change
- [ ] As a non-admin agent, confirm tenant settings pages are blocked
      (admin-only gate)

## 2. WhatsApp (1D exit)

- [ ] Send an inbound WhatsApp message to the connected number — it
      appears in the Inbox within a few seconds
- [ ] Reply from the Inbox — it's delivered to the real phone
- [ ] Resend/replay the same webhook payload (or wait for Meta's own
      retry) — confirm no duplicate message/timeline entry
- [ ] If safe to test: restart the app mid-conversation, send another
      inbound message — confirm no message is lost

## 3. Multi-site lead ingest API (1E exit)

- [ ] `POST /api/v1/leads` with a valid site API key and a fresh
      `idempotency_key` — returns 201, creates contact + deal
- [ ] Replay the exact same request (same `idempotency_key`) — returns
      200, no duplicate created
- [ ] Request with a wrong/missing API key — returns 401
- [ ] Send far more than the per-site rate limit (60/min) in a burst —
      confirm 429s start appearing
- [ ] Lead is filterable by site/campaign in the Sites UI
- [ ] A site's API key cannot write into another site's pipeline/stage
      (try posting with one site's key, confirm the deal lands only in
      that site's configured routing)

## 4. Quotes (1F exit)

- [ ] Create a quote for a real contact, add at least one catalog item
      and one free-text item
- [ ] Send the quote via WhatsApp — the contact receives a PDF document
- [ ] Open the quote's public link (`/q/[token]`) in a private/incognito
      window — renders without login, shows correct totals/branding
- [ ] Download the PDF from the public link directly — opens correctly
- [ ] Hammer the public quote view or PDF route repeatedly — confirm a
      429 eventually appears (rate limiting, 1H #2)

## 5. Automations (1G exit)

- [ ] Publish a flow using the flagship scenario shape (trigger → wait
      for reply → timeout branch) against a real or test contact
- [ ] Trigger fires (e.g. submit the form the flow listens on) — a run
      appears in the flow's Runs list, `waiting` state
- [ ] Either reply within the window (run advances/completes) or let it
      time out (follow-up branch fires) — confirm the deal stage change
      / follow-up message happens
- [ ] Restart the app while a run is mid-wait — confirm the run resumes
      correctly afterward, not lost or duplicated

## 6. Hardening (1H)

- [ ] `GET /api/cron/tick` with the wrong `x-cron-secret` returns 401;
      with the correct one returns 200
- [ ] `webhook_events` table has rows older than 30 days pruned (check
      after the pruning chain has had time to run once, or trigger it
      manually — see `docs/DEPLOY.md` §4)
- [ ] If Sentry is configured: trigger a deliberate error (e.g. a bad
      route) and confirm it shows up in the Sentry project within a
      couple minutes
- [ ] `.env` / hPanel env vars have no leftover placeholder values
      (`change-me`, empty secrets, etc.)

## If anything fails

Don't leave a failing smoke test unresolved before calling a deploy done —
either fix forward or roll back per `docs/DEPLOY.md` §6, then re-run this
checklist before considering the deploy complete.
