# Spec — Booking system (`modules/booking/`)

> **Status: draft, awaiting sign-off.** Not in PLAN.md yet. On approval this
> folds into PLAN.md as `§10 1W`, in the same shape as `1O`/`1Q` (sketch, then
> "as built"). Written against PLAN.md §1.2 (locked), §2.2 (module rule),
> §3.3 (isolation), §5.1–5.2 (public-surface pattern) and the existing
> `modules/calendar/`.

---

## 1. The decision PLAN.md asks for first: is a booking a new entity?

§5.1 ruled that *a lead is not a new entity* — an inbound submission upserts a
`contact` and optionally opens a `deal`, because the kanban already runs on
deals and a parallel `leads` table would be a second name for the same thing.
What ingest genuinely added was **attribution** plus a **machine-facing entry
point**, and those got their own tables (`lead_submissions`, `sites`).

Applying the same test to a booking gives a **split answer**, and the split is
the whole design:

| Part of a booking | Already exists? | Decision |
|---|---|---|
| Who booked | `contacts` (phone is identity, §5) | **Upsert a contact**, via the existing `recordLeadSubmission()` engine. No new person table. |
| The appointment on the agenda | `calendar_events` | **Write a `calendar_events` row.** A booking that isn't on the agenda is a booking the rep never sees. |
| Commercial interest | `deals` | **Optional, per booking type.** Off by default. |
| Reserved-slot lifecycle: public token, confirmed → cancelled → no-show, reschedule chain, reminder state | nothing | **New `bookings` table.** |

So: **a booking is not a new kind of person and not a new kind of calendar
entry — it is a new kind of *reservation state* over an existing calendar
entry.** `bookings` is to `calendar_events` what `lead_submissions` is to
`contacts`: the provenance-and-lifecycle row beside the thing the app already
draws.

Concretely, one public booking writes, in one transaction:

```
contacts        upsert by phone (may already exist)
calendar_events insert  ← the rep's agenda sees it immediately, no sync job
bookings        insert  ← token, status, answers, attribution, resource
deals           insert  (only if the booking type says so)
activities      insert  (type: 'booking')
```

**Why not put `status` on `calendar_events` and skip `bookings`?** Because it
would push public-surface concerns (a guessable-token cancel link, a
reschedule chain, no-show accounting, reminder bookkeeping) into a table the
whole app already reads for the simple case "a visit at four". §4's own
reasoning for keeping `quotes` separate from future `invoices` is the same
one: different immutability and lifecycle rules do not belong in one table.
`calendar_events` stays exactly as strict as it is today.

**Why not a separate booking calendar, ignoring `calendar_events`?** Because
availability would then be a lie. A rep with a 15:00 site visit already on the
agenda must not be offered at 15:00 by the public page. Busy-time is read from
`calendar_events` — *all* of it, not only booking-produced rows — which is
only sound if bookings live there too.

### Cancellation keeps the row, drops the reservation

Cancelling sets `bookings.status = 'cancelled'` and **deletes the
`calendar_events` row** (the agenda should not show cancelled things, and
`1S`'s delete path already exists). The `bookings` row is the history: who
cancelled, when, why. Rescheduling is *cancel + create*, linked by
`rescheduled_from_id`, so the audit trail is a chain rather than a mutated row.

---

## 2. Schema (`src/db/schema/booking.ts`)

All PKs `char(26)` ULID; every table carries `tenant_id` + `created_at` /
`updated_at` per §4. Times are stored **UTC `datetime`**; every wall-clock
rule is expressed in the tenant's timezone via `modules/calendar/zoned-time.ts`
(§2.3, and the reason `tenants.timezone` exists).

### `booking_resources`
Who or what gets booked.

- `kind` — `user | resource`. A `user` resource points at `user_id` (a rep);
  a `resource` is a room, a chair, a tow truck — a thing with a calendar but
  no login.
- `user_id?` (null for `kind='resource'`), `name`, `is_active`.
- Unique `(tenant_id, user_id)` where set — one resource per rep, so "está
  ocupado" has one answer.

*Why a resource table rather than booking straight against `users`:* half the
target market books a thing, not a person (a consultorio, a cancha, a grúa),
and `users` costs a seat under §13 H6's seat limits. A room must not burn a
seat.

### `booking_types`
What can be booked. The public page is one of these.

- `name`, `slug` (unique per tenant — the public URL), `description`,
  `is_active`, `color`.
- `duration_minutes`, `buffer_before_minutes`, `buffer_after_minutes`,
  `slot_increment_minutes` (default = duration).
- `min_notice_minutes` (default 120 — nobody wants a booking for 20 minutes
  from now), `max_advance_days` (default 60), `max_per_day?`.
- `assignment` — `fixed | any | round_robin`.
- `location_mode` — `in_person | phone | video | whatsapp`, plus
  `location_detail` (address or link).
- Routing defaults, **configured in the CRM and never sent by the caller**,
  exactly as §5.1 requires of sites: `create_deal` (bool),
  `default_pipeline_id?`, `default_stage_id?`, `default_tag_ids` JSON,
  `default_owner_user_id?`.
- `questions` JSON — extra fields on the public form, the same ordered
  field-def shape `forms.fields` already uses. Reused, not reinvented.
- `settings` JSON — `{ turnstileSiteId?, requireTurnstile?, reminderMinutes?,
  cancellationCutoffMinutes?, confirmationMessage? }`.
  `turnstileSiteId` borrows a site's credentials exactly as `FormSettings`
  does today (§5.2.1): credentials, not provenance.

### `booking_type_resources`
Join table: which resources can serve this type. Unique
`(tenant_id, booking_type_id, resource_id)`.

### `booking_availability_rules`
The recurring weekly pattern, per resource.

- `resource_id`, `weekday` (0–6, Sunday=0 to match `weekdayOf`),
  `start_time` / `end_time` as `varchar(5)` `"HH:MM"` **local wall clock**.
- Several rows per weekday allowed — that is how a siesta break is expressed
  (`08:00–12:00`, `14:30–18:00`), which this market actually needs.

*Why wall-clock strings and not UTC instants:* "abre a las 8" must survive a
DST change in any tenant timezone we later sell into. `businessHours` in
tenant settings already stores `"HH:MM"` for the same reason
(`automations/conditions.ts`).

**Relationship to `tenants.settings.businessHours`:** business hours are the
tenant-wide **ceiling**, availability rules are the per-resource *offer*. A
slot must satisfy both. A resource with no rules at all falls back to business
hours; a tenant with neither is treated as **closed for booking** — the
opposite of `isWithinBusinessHours`'s "no hours means always open", and
deliberately so: an unconfigured automation condition should not stop
automations, but an unconfigured public booking page must not offer a stranger
3 a.m. on Sunday.

### `booking_blackouts`
Holidays, vacations, one-off closures.

- `resource_id?` (null = whole tenant), `starts_at` / `ends_at` UTC, `reason`.

### `bookings`
The reservation.

- `booking_type_id`, `resource_id`, `contact_id`, `calendar_event_id?`,
  `deal_id?`, `lead_submission_id?`.
- `starts_at` / `ends_at` UTC.
- `status` — `confirmed | cancelled | completed | no_show`.
- `cancelled_at?`, `cancelled_by?` (`contact | staff | system`),
  `cancel_reason?`.
- `rescheduled_from_id?` — the chain.
- `public_token` (unique, 32 random bytes base64url) — the manage/cancel link,
  same secret-is-the-URL model as `/q/[token]` (§8).
- `answers` JSON (the type's custom questions), `source`, `utm` JSON,
  `page_url`, `referrer`, `ip_address`, `user_agent`.
- `reminder_job_id?`, `reminder_sent_at?`.
- `active_slot` `varchar(80)` — see §3.

Indexes: `(tenant_id, starts_at)`, `(tenant_id, resource_id, starts_at)`,
`(tenant_id, contact_id)`, `(tenant_id, status)`, unique `public_token`,
unique `(tenant_id, active_slot)`.

### One change to an existing table
`activities.type` gains `'booking'`. That is an enum widening in a migration —
additive, no backfill, nothing existing reads a value it doesn't know. It is
the only edit this feature makes to a non-booking table, and it is what puts
"reservó una cita para el jueves" on the contact timeline that §5 promises is
unified.

---

## 3. Double-booking: two guards, because one is not enough

The race is real and cheap to hit: two visitors on the same slot, or one
visitor double-clicking.

1. **Transactional overlap check.** Reserve inside a transaction that takes
   `SELECT ... FOR UPDATE` over the resource's `calendar_events` in the day
   window, re-derives availability, and only then inserts. Same MySQL locking
   discipline §2.1 already relies on for the job queue.
2. **A unique index as the backstop.** `active_slot` holds
   `"<resourceId>:<startsAtEpochSeconds>"` while the booking is live and is set
   to **NULL** on cancel. MySQL's unique indexes permit unlimited NULLs, so
   this enforces "one live booking per resource per exact start" without a
   partial index, and a cancelled slot becomes bookable again with no cleanup.

Guard 2 only catches *identical* starts, which is the common double-submit;
genuine partial overlap (a 30-minute booking starting inside a 60-minute one)
is guard 1's job. Both, stated plainly, because relying on the index alone
would be wrong and relying on the transaction alone leaves the double-click
window open under a retry.

---

## 4. Slot generation — `modules/booking/slots.ts`, pure

Signature, deliberately taking data rather than a `ctx`, so the whole thing is
unit-testable with no database and no clock — the shape `calendar/grid.ts`,
`sites/alerts.ts` and `lib/object-path` already established:

```ts
generateSlots(input: {
  timeZone: string;
  from: DayKey; to: DayKey;
  type: { durationMinutes; bufferBefore; bufferAfter; slotIncrement;
          minNoticeMinutes; maxAdvanceDays; maxPerDay? };
  rules: Array<{ resourceId; weekday; start: "HH:MM"; end: "HH:MM" }>;
  businessHours: BusinessHours | null;
  busy: Array<{ resourceId; startsAt: Date; endsAt: Date }>;
  blackouts: Array<{ resourceId: string | null; startsAt; endsAt }>;
  now: Date;
}): Array<{ startsAt: Date; endsAt: Date; resourceIds: string[] }>
```

Rules, in order:
1. Walk local days `from..to`; drop days beyond `maxAdvanceDays`.
2. Intersect each resource's rules for that weekday with `businessHours`.
3. Step by `slotIncrement` from each window start; a slot fits if
   `start − bufferBefore … end + bufferAfter` is inside the window.
4. Convert to UTC with `zonedTimeToUtc` — the one place DST is handled.
5. Drop slots overlapping `busy` **or** `blackouts` for that resource.
6. Drop slots starting before `now + minNoticeMinutes`.
7. Collapse to distinct start times, carrying every free resource; assignment
   picks one at booking time (`round_robin` = fewest bookings that day, ties
   broken by resource id, so it is deterministic and testable).

`busy` is read from `calendar_events` for the resource's `assigned_user_id`
(for `kind='user'`) — **all** events, not just bookings. That single choice is
what makes "synced with the Agenda module" true rather than aspirational, and
it needs no sync job in either direction.

---

## 5. Public surface

Style, rate limiting and error shape follow §5.1–5.2 and the existing
`/q/[token]` and `/f/[tenantSlug]/[formSlug]` pages. **No CORS anywhere** —
every fetch below is same-origin, from our own page.

| Surface | Purpose | Guard |
|---|---|---|
| `GET /b/[tenantSlug]/[typeSlug]` | The public booking page. Server-rendered, tenant branding, tenant locale, honeypot + optional Turnstile. | 60/min per IP |
| `GET /api/v1/booking/[tenantSlug]/[typeSlug]/slots?from&to` | Slots for a month, so the visitor can page months without a reload. Same-origin only. Returns starts only — never resource names, never who is free. | 30/min per IP |
| `POST /api/v1/booking/[tenantSlug]/[typeSlug]` | Create the booking. zod-validated; routing defaults come from the type row, never the body. Honeypot + Turnstile. | 10/min per IP, 20/min per type |
| `GET /b/g/[token]` | Manage: see, cancel, reschedule. The token is the secret. | 60/min per IP |
| `POST /b/g/[token]/cancel`, `/reschedule` | Server actions. Refused past `cancellationCutoffMinutes`. | 10/min per token |

Responses mirror §5.1's contract: `201 { bookingId, startsAt, manageUrl }`,
`404` unknown/inactive type (a path segment is all the caller can tell,
exactly as §5.2.3 rules for hook tokens), `409` slot taken since the page
loaded — the one genuinely new status, because "someone beat you to it" is a
real outcome the visitor must see, `422` validation, `429` rate limited.

**No public API-key lane in v1.** A booking made by a client's own backend is
a plausible future ask, but §5.1's lanes exist for *lead* ingest; adding a
third credential surface before anyone asks is scope we don't need. The
booking page is the surface.

---

## 6. Module boundary

```
src/modules/booking/
  types.ts        booking-type CRUD (service layer, ctx-first)
  resources.ts    resources + availability rules + blackouts
  slots.ts        PURE slot generation (no db, no clock)
  bookings.ts     reserve / cancel / reschedule / no-show — the transaction
  public.ts       tenantSlug+typeSlug → type, pre-TenantContext resolution
  reminders.ts    job handler
  events.ts       booking.created / .cancelled / .no_show bus (§5)
```

Everything takes `ctx: TenantContext` first and goes through `tenantDb(ctx)`
(§3.3 layer 2). `public.ts` resolves a tenant slug before any context exists —
structurally identical to the API-key and `phone_number_id` lookups §3.3
already exempts, and it carries the same comment.

**App surfaces:** `(app)/booking/` (types, resources, availability, an
upcoming list), `(public)/b/[tenantSlug]/[typeSlug]/`, `(public)/b/g/[token]/`,
`api/v1/booking/...`. Existing agenda pages are untouched: a booking simply
appears there because it *is* a calendar event.

## 7. Hooks into the rest of the app (the minimum, and no more)

- **Automations.** Three new `TRIGGER_TYPES`: `booking_created`,
  `booking_cancelled`, `booking_no_show`. Enum entries plus an emit call —
  the engine itself does not change. This is the "booking confirmation
  triggers an automation" path.
- **Jobs.** `booking.reminder`, enqueued with `run_at = starts_at −
  reminderMinutes`; the handler sends over WhatsApp through the existing
  `whatsapp/send.ts` and its 24h-window rules, unmodified. Cancel sets the job
  dead rather than deleting it, so "why did they get a reminder for a
  cancelled visit" is answerable.
- **Leads.** The contact upsert calls `recordLeadSubmission()` with the type's
  defaults. One implementation of "an inbound stranger becomes CRM data",
  reused a third time.

## 8. No-show and cancellation, concretely

- The **visitor** cancels from `/b/g/[token]`, up to
  `cancellationCutoffMinutes` before the start (default 120). After that the
  page says to call — a hard cutoff is what stops 08:55 cancellations for a
  09:00 slot.
- **Staff** cancel or mark `no_show` from the booking's page or the agenda,
  any time. `no_show` is manual on purpose: nothing in the system knows the
  customer didn't turn up, and auto-marking would quietly libel people.
- A nightly job flips past `confirmed` bookings to `completed` so "no-show
  rate" has a denominator. Reversible by staff.
- No-show rate per contact is a query, not a column: `bookings` already holds
  every outcome, and a counter on `contacts` would be a second truth to keep
  in sync.

## 9. Tests (the merge gate, §3.3 layer 3)

- `slots.test.ts` — pure, no DB, no clock: siesta split, buffers, DST boundary
  in `America/Asuncion`, business-hours intersection, min-notice, max-advance,
  blackout, busy non-booking calendar event blocking a slot, empty-rules =
  closed, round-robin determinism.
- `bookings.integration.test.ts` — against MySQL: reserve → contact + event +
  booking + optional deal + activity in one transaction; concurrent identical
  reserve where exactly one wins with `409`; cancel frees the slot and deletes
  the event; reschedule chains; cross-tenant isolation on every service and on
  both public routes; token guessing gets 404.
