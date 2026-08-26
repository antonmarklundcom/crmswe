# Spec — Embeddable AI chat widget (`modules/chatwidget/`)

> **Status: signed off, built, and folded into PLAN.md as `§10 1X`** — that
> section is the summary of record; this document is the long form behind it.
> Differences between this spec and what shipped are recorded in
> **§9 As built** at the end. Written against §1.2 (locked), §2.2, §3.3,
> §5.1 (public surface + "the only client-side code this project ships"),
> §10 1O (the AI driver, its guardrails and its spend caps) and `docs/DEPLOY.md §5`.

---

## 1. Three decisions up front

### 1.1 Conversation storage: **new tables, not `conversations`/`messages`**

The brief's suspicion is right, and the schema proves it rather than merely
suggesting it. `conversations` is `NOT NULL` on both `wa_account_id` and
`contact_id`; `messages` carries a unique `wa_message_id`, a WhatsApp media
`type` enum and Meta delivery statuses. A website visitor has **no WhatsApp
account, no phone number, and therefore no `contacts` row** — `contacts.phone`
is `NOT NULL` and unique per tenant (§4, §5). Fitting a visitor in would mean
nulling out three columns the entire WhatsApp pipeline currently relies on,
inventing placeholder phone numbers, and teaching the 24h-window logic to skip
rows that aren't WhatsApp. That is exactly the "second competing name for one
thing" §5.1 warns about, pointed in the other direction.

So: `chat_conversations` + `chat_messages`, new, in `modules/chatwidget/`.
The WhatsApp pipeline is not touched.

What *is* reused is the **shape**: `chat_messages` copies the `messages`
status/audit pattern verbatim — `direction` `in|out`, a `status` enum, an
`error` JSON column, `sent_by_user_id`, an audit pointer at the AI row. Same
vocabulary, so a rep reading either table reads the same thing.

**A visitor becomes a contact the moment they give a phone**, and by exactly
one route: `recordLeadSubmission()`, the §5.1 engine, with the widget's site id
and its routing defaults. Chat is then a *third* lead entry path, not a third
lead model. Before that, the conversation stands alone with a `contact_id` of
NULL — which is the honest representation of "someone is asking a question and
we don't know who they are".

### 1.2 Embed transport: **iframe, so §5.1's no-CORS rule survives intact**

A browser has to talk to the CRM for this feature to exist at all, which looks
like a head-on collision with §5.1's "no CORS surface, no key in page source".
It isn't, if the widget is served **from our own origin inside an iframe**:

```html
<script src="https://crm.example/w.js" data-widget="wgt_01H..." defer></script>
```

`w.js` (~1.5 KB, the same budget as `vc-attribution.js`, and the second and
last piece of client-side code this project ships) does three things: draw a
bottom-right bubble, inject
`<iframe src="https://crm.example/w/<widgetKey>">` on first open, and listen
for `postMessage` to resize it. **Every request the chat makes is same-origin,
from our page to our API.** No `Access-Control-Allow-Origin` header is added
anywhere. `/api/v1/leads` is byte-for-byte unchanged, and so is the rule it
embodies.

The alternative — a CORS-enabled JSON API plus a shadow-DOM widget — is how it
is often done and is strictly worse here: it reopens a locked decision, it
needs an origin allowlist that `Origin` spoofing from a non-browser client
ignores anyway, and it puts the tenant's system prompt one fetch away from any
page that cares to ask. The iframe costs one nested browsing context and buys
back the entire lock.

**`widgetKey` is a public identifier, not a credential** — the same category as
a Turnstile *site* key (§5.2.1), which already renders into page source by
design. It is enumerable, so nothing is authorised by holding it. What defends
the endpoint is: a **referer allowlist on the embedding page** (belt, not
braces — it stops casual re-embedding, and is documented as not being an auth
boundary), per-IP and per-visitor rate limits, a required Turnstile challenge
before the *first* AI call on a conversation, and the spend caps in §1.3 which
bound the worst case in money rather than in politeness.

**Where the allowlist is enforced, and where it is not.** The only request
that knows which page is embedding the widget is **the iframe document** —
`GET /w/[widgetKey]`, whose `Referer` *is* the host page. That is where the
tenant's `allowed_origins` is checked, and a page outside the list gets a
**404**: a widget that may not be embedded here does not exist here. An
absent `Referer` once a list exists is the same refusal — a tenant who has
named their sites did not name an unattributable one.

It is deliberately **not** checked on the chat's own API calls. Those are
same-origin fetches from our iframe: a POST carries this CRM's `Origin` and
the GET poll carries none at all, so neither says anything about the site the
visitor is on. Checking there bounds nothing and 403s every tenant who fills
the field in. Those routes assert **same-origin** instead — absent `Origin`
or our own passes, anything else is 403 — which is a different and smaller
claim, stated as such.

The same reasoning applies inside the iframe: its `message` listener accepts
`vc-chat:page` only from `window.parent`, and only from the origin the server
read off this document's own `Referer`. Without both checks any page that
framed the widget could rewrite the attribution on someone else's lead.

### 1.3 Spend control: **one per-tenant daily budget shared with WhatsApp**

§10 1O's caps are per-conversation-per-day and per-tenant-per-day, counting
*provider calls* including drafts. If the widget gets its own independent
counters, a tenant's actual daily ceiling silently doubles the day this ships —
which defeats the reason the per-tenant cap exists ("cost is per-token and
per-tenant").

**Recommendation:** generalise the existing `ai_replies` table rather than add
a second one:

- add `channel varchar(10) NOT NULL DEFAULT 'whatsapp'` (`whatsapp | chat`);
- add `chat_conversation_id char(26) NULL`;
- relax `conversation_id` and `contact_id` to nullable.

The migration is additive with a default, so every existing row and every
existing query keeps its meaning, and `countRepliesTodayForTenant()` becomes
the shared budget for free. It is a real edit to a table the WhatsApp pipeline
owns, so it is called out here as a decision needing sign-off rather than
slipped in.

*Rejected alternative:* a separate `chat_ai_replies` table plus a summing view.
Cheaper to write, and it makes the one number that matters — "what is this
tenant spending today" — the result of a UNION that any future third channel
must remember to join. The cap belongs in one place because the bill does.

Per-conversation cap applies unchanged (its own default: **12** provider calls
per chat conversation per day — a website chat is chattier than a WhatsApp
thread, but 12 still ends a loop). Both caps keep hard ceilings the settings
form cannot exceed, per 1O.

**Plus one sub-cap the shared ceiling cannot express: chat may consume at most
half the tenant's daily budget.** The shared ceiling bounds the *bill*; this
bounds *which channel spends it*. Chat is the public, unauthenticated surface
— reachable by anyone who can load the tenant's website — so left alone it can
burn the whole allowance before a customer already mid-thread on WhatsApp gets
an answer. `countRepliesTodayForChannel()` is the channel-filtered sibling of
the shared counter, and `evaluateGuards` gained an optional
`maxPerChannelPerDay` (absent for WhatsApp, which has no sub-cap) checked
*after* the shared ceiling, because the shared ceiling is the one about money.
Floored, never to zero: a tenant whose entire budget is one call can still
answer one visitor.

### 1.4 Draft-mode-first, honestly restated

1O's "start every tenant on draft" is a guarantee enforced by a ceiling
(`resolveMode`), not a form default, and it carries over here — but "draft"
means something different on a live website, so say what it means:

| Mode | Visitor sees | Rep sees |
|---|---|---|
| `off` | A contact form in the bubble; no AI call at all. | A lead. |
| `draft` *(default)* | "Un asesor te responde enseguida." Their message is captured. | The AI's suggested reply, one click to send. |
| `send` | The AI's reply, live. | The transcript, with a kill switch. |

The tenant-level mode remains a **ceiling** over the per-widget mode, reusing
`resolveMode` unchanged: a widget cannot send while the tenant is on draft.
Going autonomous stays a two-key operation. An LLM inventing a price in
guaraníes is the same commercial risk on a website as it is on WhatsApp.

---

## 2. Schema (`src/db/schema/chatwidget.ts`)

### `chat_widgets`
One per site — because §1.2 locks **one tenant, many sites**, and a client's
branding, greeting and system prompt are per-site facts. A tenant with one site
has one widget and never notices the distinction.

- `site_id` (unique per tenant), `widget_key` (unique, public, `wgt_` +
  ULID), `is_active`.
- `mode` — `off | draft | send`, default `draft`.
- Branding: `name`, `avatar_url?`, `primary_color`, `greeting`,
  `launcher_label`, `position` (`right | left`), `offline_message`.
- AI: `system_prompt` (the tenant's own words, appended to — never replacing —
  `lib/ai/prompt.ts`'s Spanish `GUARDRAILS` block), `never_promise`,
  `max_replies_per_conversation_per_day`.
- Capture: `ask_for_phone` (bool, default true), `capture_after_messages`
  (default 2), plus §5.1-style routing defaults `create_deal`,
  `default_pipeline_id?`, `default_stage_id?`, `default_tag_ids` JSON,
  `default_owner_user_id?` — **read from this row, never from the caller**.
- `allowed_origins` JSON (string[]; empty = any, with the UI saying plainly
  what that means).
- `business_hours_mode` — `always | business_hours` (outside hours the widget
  shows `offline_message` and captures, without spending a token).

Widget config lives in a **table, not in `sites.settings` JSON**, unlike
Turnstile: it is read on a public request path on every page load of every
client site, it needs a unique-indexed lookup key, and it is edited by a form
with a dozen fields. Turnstile's two encrypted strings were configuration;
this is closer to a `forms` row.

### `chat_conversations`
- `tenant_id`, `widget_id`, `site_id`, `visitor_id` (ULID minted client-side,
  first-party cookie on **our** iframe origin, 90 days — so a returning
  visitor keeps their thread), `contact_id?` (set on capture),
  `lead_submission_id?`.
- `status` — `open | closed`.
- `assigned_user_id?`, `last_message_at`, `last_visitor_message_at`,
  `unread_count` (mirrors `conversations`).
- `ai_disabled_at?` — the per-conversation kill switch, same column and same
  meaning as `conversations.ai_disabled_at`.
- `page_url`, `referrer`, `utm` JSON, `ip_address`, `user_agent`, `locale`.
- Index `(tenant_id, widget_id, visitor_id)`, `(tenant_id, last_message_at)`,
  `(tenant_id, status)`.

### `chat_messages`
- `chat_conversation_id`, `direction` `in|out`,
  `author` — `visitor | ai | agent | system`,
  `body` text,
  `status` — `queued | sent | failed` (the `messages` vocabulary, minus the
  delivery states a same-page render doesn't have),
  `error` JSON, `sent_by_user_id?`, `ai_reply_id?`.
- Index `(tenant_id, chat_conversation_id, created_at)`.

### Existing tables touched
- `ai_replies` — the three additive columns in §1.3. **The only edit outside
  the module.**
- `activities.type` — gains `'chat'` when a transcript is attached to a
  captured contact's timeline. (Shared with the booking spec's `'booking'`;
  whichever ships first widens the enum.)

---

## 3. Public surface

All same-origin, all under our own domain; no CORS headers introduced.

| Surface | Purpose | Guard |
|---|---|---|
| `GET /w.js` | The embed snippet. Static, cacheable, no per-tenant content. | CDN-cacheable |
| `GET /w/[widgetKey]` | The iframe document: branded chat UI, tenant locale. 404 on unknown/inactive. **The one place the tenant's origin allowlist is enforced**, against this request's `Referer` (§1.2). | referer allowlist |
| `POST /api/v1/chat/[widgetKey]/messages` | Post a visitor message, get the reply (or the "un asesor te responde" acknowledgement in draft mode). Carries the Turnstile token on the first message of a conversation. | same-origin; 20/min per IP, 10/min per visitor; Turnstile before the first provider call; plus the AI caps |
| `POST /api/v1/chat/[widgetKey]/capture` | Name + phone → `recordLeadSubmission()`. | same-origin; 5/min per visitor |
| `GET /api/v1/chat/[widgetKey]/poll?since=` | New agent/AI messages. | same-origin; 15/min per visitor + IP |

**Polling, not websockets**: §2.1 locks a single Node process on Hostinger
managed hosting with no Redis and no separate worker — a websocket fan-out has
nowhere to live. Polling is unglamorous and it fits the platform we actually
deploy on. As built it is a plain interval poll every 8 seconds rather than a
25-second long-poll (see §9), which is why the route carries a per-visitor
rate limit of its own.

**The Turnstile gate** (§1.2) sits on the messages route, on the same ladder
§5.2.1 established: the widget's site has no secret configured → skipped
entirely; configured → the **first provider call of a conversation** needs a
valid token. "First" is read off `ai_replies`, which gets a row before every
provider request, so a call some other guard refused leaves the challenge
still owed rather than spending it. A missing or rejected token is **never an
error to the visitor**: the message is captured and the response is the same
`pendingHuman` shape a tripped cap gives.

Errors follow §5.1's vocabulary: `404` unknown widget (all a caller can tell
from a path segment), `403` inactive widget or non-writable tenant (grace /
locked, per the §10 1C follow-up), `422` validation, `429` rate limited. A
tripped **spend cap answers `200` with the draft-mode acknowledgement**, never
an error: the visitor must not be shown the tenant's billing state.

---

## 4. The AI path — one driver, one guard file, no second abstraction

`lib/ai/` is used **exactly as it is**: `getAiDriver()`, `AI_DRIVER` /
`OPENAI_API_KEY` / `GEMINI_API_KEY` / `AI_BASE_URL` per `docs/DEPLOY.md §5`,
`buildSystemPrompt()` for the guardrail block. Nothing new is added to
`lib/ai/` beyond one optional field on `BusinessContext` for the widget's own
system prompt — and if it turns out `instructions` already covers it, not even
that.

`modules/chatwidget/reply.ts` mirrors `modules/ai/reply.ts` and reuses its two
pure functions verbatim — `evaluateGuards()` and `resolveMode()` — with the
WhatsApp-only guard inputs pinned to constants a chat can't violate:

| 1O guard | In the widget |
|---|---|
| `tenantAiEnabled` | tenant AI setting, unchanged |
| `driverConfigured` | unchanged |
| `conversationAiDisabled` | `chat_conversations.ai_disabled_at` |
| `optedOut` | n/a → `false` (no contact yet, and BAJA is a WhatsApp opt-out) |
| `withinWindow` | **`true` always** — the 24h window is Meta policy about WhatsApp, and does not exist on a website. Pinned in one place, with the comment saying so, rather than deleted from the shared function. |
| conversation / tenant daily caps | shared counters per §1.3 |
| *(chat only)* channel daily cap | `countRepliesTodayForChannel("chat")` against half the tenant budget — §1.3's sub-cap. WhatsApp passes no `maxPerChannelPerDay` and is unaffected. |

The handoff keyword works the same way it does on WhatsApp (`humano` by
default) and for the same reason 1O gives: a customer asking for a human must
be heard whether or not the tenant configured anything.

Guard refusals are recorded, never thrown, and never surface to the visitor as
an error.

---

## 5. Module boundary

```
src/modules/chatwidget/
  widgets.ts       widget CRUD, key issue/rotate (service layer, ctx-first)
  public.ts        widgetKey → widget + tenant (pre-TenantContext, §3.3 exempt)
  conversations.ts chat conversation/message persistence
  reply.ts         the guarded AI path (reuses modules/ai's pure guards)
  capture.ts       visitor → contact via recordLeadSubmission()
  events.ts        chat.started / chat.captured / chat.handoff bus
```

**App surfaces:** `(app)/chat/` (a live inbox for chat conversations, with the
draft-approve action), `(app)/settings/widget/` per site, `(public)/w/[key]/`,
`public/w.js`, `api/v1/chat/...`.

**Deliberately a separate `/chat` surface, not a tab inside `/inbox`.** The
WhatsApp inbox is `1D`/`1U` territory with its own assignment and window
rules; merging two channels into one list is a real feature ("bandeja
unificada") and it deserves its own decision, not a side effect of this one.
Flagged in §7 as the follow-up.

---

## 6. Hooks into the rest of the app

- **Automations.** One new trigger, `chat_lead_captured`, which fires on the
  capture — i.e. once there is a contact for a flow to act on. Deliberately
  *not* a trigger on every visitor message: a flow that runs per keystroke is
  a bill, not a feature.
- **Leads / attribution.** Capture goes through `recordLeadSubmission()` with
  the widget's site id, so a chat lead lands in the same pipeline with the same
  first-touch UTM rules as a form or an API lead. The iframe reads
  `document.referrer` and the parent URL via `postMessage` from `w.js` for
  `page_url` — the `vc_attr` cookie is on the *client's* origin and is not
  readable from our iframe, so `w.js` forwards it if present.
- **Ingest health.** Not extended to chat in v1: `site_ingest_health` answers
  "is this site's form still posting", and a widget that stops being embedded
  produces the same silence with a different cause. Worth doing, listed in §7.

---

## 7. Explicitly not in v1

File uploads in chat · websockets · a unified WhatsApp+chat inbox ·
RAG over tenant documents · proactive/exit-intent triggers · chat in
`site_ingest_health` · visitor typing indicators · multilingual widget copy
(Spanish only, i18n-ready, per §1.2).

## 8. Tests (the merge gate, §3.3 layer 3)

- Pure: guard-input mapping (especially that `withinWindow` is pinned true and
  cannot be reached from a request), `resolveMode` ceiling under every
  tenant/widget mode pair, origin-allowlist matching including subdomain and
  scheme edge cases, the capture-threshold decision.
- DB-backed (MySQL, as CI already runs): a full conversation in each of the
  three modes; per-conversation and per-tenant caps tripping and answering
  `200`; the shared cap actually counting a WhatsApp reply against a chat one;
  handoff keyword silencing; capture creating contact + optional deal +
  submission exactly once for a repeated capture; cross-tenant isolation on
  every service and every public route; an unknown/inactive widget key
  answering 404/403 and spending no tokens.
- A regression assert that no `Access-Control-Allow-Origin` header is emitted
  by any route under `api/v1/`.
- The allowlist, on both sides of the line it actually draws: a widget with
  `allowed_origins` configured serving its own legitimate traffic end to end
  (a POST carrying our origin, a poll carrying none, a capture), and the
  iframe document refusing a `Referer` outside the list — and an absent one.
- The Turnstile gate: an absent and a rejected token each capturing the
  message, spending nothing and leaving the challenge owed; a valid one
  asked for once per conversation, not once per message.
- The chat sub-cap biting while the tenant's shared budget still has room
  that WhatsApp can use.
- The poll route's per-visitor rate limit.

---

## 9. As built (differences from the spec above)

- **`ai_replies` was generalised exactly as §1.3 proposed**: `channel`
  (default `'whatsapp'`), `chat_conversation_id`, and `conversation_id` /
  `contact_id` relaxed to nullable. `countRepliesTodayForTenant` needed no
  change at all — it already counted every row a tenant has, which is the
  whole argument for one table made concrete.
- **One consequence the spec did not name**: `deliverReply` (the WhatsApp
  approve-and-send path) now has to refuse a chat row explicitly, since a
  chat reply has no conversation to send into. It answers "not a WhatsApp
  reply" rather than reaching `sendText` with a null. There is a test for it.
- **Chat drafts stay out of the WhatsApp inbox for free**: `listPendingDrafts`
  filters on `conversation_id`, which a chat row does not have. The chat side
  gets its own `listPendingChatDrafts`. One shared table, two inboxes, no
  filtering the caller has to remember.
- **The origin allowlist rejects lookalike hosts.** A naïve suffix match would
  accept `evil-example.com` for `example.com`; a bare host now matches only
  itself, and a leading dot (`.example.com`) is the explicit
  "and its subdomains" form. Still documented as not an auth boundary.
- **The allowlist shipped on the wrong request, and it bricked the feature
  for anyone who used it.** It was checked in the API paths against
  `request.headers.get("origin")` — which for a same-origin POST from our own
  iframe is *this CRM's* origin, and for the same-origin GET poll is nothing
  at all. So a tenant who filled `allowed_origins` in got 403 on every
  legitimate request, and the check bounded nothing in exchange. Enforcement
  moved to the iframe document per §1.2; the API paths assert same-origin
  instead. No test covered the configured-allowlist happy path, which is how
  it shipped; there is one now.
- **The iframe's `message` listener really does check `event.origin` now.**
  It did not, though this section previously said so: `window.tsx` accepted
  `vc-chat:page` from any page that framed it, which let one rewrite the
  attribution on someone else's lead. It now requires both the sender to be
  `window.parent` and the origin to match the one the server read off this
  document's `Referer`, and posts `vc-chat:close` back to that origin rather
  than `"*"`.
- **The visitor id is minted in the iframe's own `localStorage`**, not by the
  server. It is a conversation handle rather than a credential — it grants
  nothing the public widget key doesn't — and a blocked storage jar degrades
  to a fresh thread per load instead of no chat at all.
- **`w.js` forwards the host page's URL, referrer and `vc_attr` cookie** by
  `postMessage` and query string. The spec noted the cookie is unreadable
  from our iframe; this is the mechanism.
- **A tripped cap, a draft, a provider error and a handoff all look identical
  to the visitor**: "a person is coming". Implemented as one `pendingHuman`
  flag rather than distinct statuses, so no future branch can leak the
  tenant's billing state to their customer.
- **`business_hours_mode` is checked before the driver is called**, not after,
  so an out-of-hours message costs nothing.

- **The poll is an 8-second interval, not a 25-second long-poll.** §3 proposed
  long-polling; holding a request open for 25 seconds ties up a connection in
  the single Node process §2.1 locks us to, which is the same constraint that
  ruled websockets out. A short interval poll costs a request every 8 seconds
  per *open* widget and holds nothing. It is also why the route needed a rate
  limit of its own — 15/min per visitor and IP — which it shipped without.
- **Chat's spend has a sub-cap as well as the shared ceiling** (§1.3): half
  the tenant's daily budget, floored but never to zero. The ceiling is about
  the bill and stays one number; the sub-cap is about which channel spends it,
  and exists because the widget is the surface anyone on the internet can
  reach.

**Verified**: `widgets.test.ts` — 13 pure cases (host matching including the
lookalike and subdomain edges, the pinned WhatsApp-only guards, all three caps
including chat's half-share and its floor, the draft ceiling in all four mode
pairs). `chat.integration.test.ts` — 19 cases against MySQL: all three modes;
a WhatsApp reply spending the chat's tenant budget; the chat sub-cap biting
while the tenant still has budget WhatsApp can use; the Turnstile gate on all
three of its states; the poll limiter; a configured allowlist serving its own
legitimate traffic; the iframe document refusing a wrong and an absent
`Referer`; a cross-origin API call refused; the handoff keyword; capture
creating a contact and one timeline entry even when repeated; the unknown or
inactive key spending zero tokens; cross-tenant isolation; chat drafts absent
from the WhatsApp inbox; and `deliverReply` refusing a chat row. Lint,
typecheck and the full suite green against MySQL.
