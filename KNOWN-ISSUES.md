# Known issues

Minor, non-blocking findings recorded per the autonomy protocol (plan.md §4.3)
instead of stopping a phase. Each entry says who should pick it up.

## Open

### O3-1 — `sv-SE` date pickers are a request, not a guarantee
`<html lang>` now carries the full BCP-47 tag (`sv-SE`), which is the
standards-correct way to tell a browser how to draw a native
`<input type="date">` and which day its week starts on. Firefox honours it.
**Chrome and Safari do not** — they use the browser's or the OS's own locale
regardless, so a Swedish user running an en-US Chrome still sees `mm/dd/yyyy`
in the raw picker. The app's own rendered dates are unaffected: those go
through `lib/i18n/format`, which is `sv-SE` throughout. Closing this properly
means replacing every `<input type="date">` with a custom picker component,
which is a real UI project and buys back only the picker chrome.
*Owner: none — recorded as a platform limit. Revisit if a tenant complains.*

### O3-2 — The superadmin WhatsApp-health console is not behind the flag
`/whatsapp-health` in the superadmin console still exists and still lists
every tenant's WhatsApp accounts. It is deliberately untouched: the flag is
*per tenant*, and a platform-wide operator surface cannot be gated by one
tenant's setting. It is invisible to tenant users either way (superadmin
only), so it is a wart on Anton's own console rather than a leak. If the
Swedish product never runs WhatsApp for anybody, the whole surface can go.
**Revisited (2026-08-29):** still not a quick fix — the page also carries
the platform-wide dead/stuck job queue view (`queueDead`/`queueStuck`),
which has nothing to do with WhatsApp and is worth keeping regardless of
the channel's fate. Removing or hiding the page would cost that too.
*Owner: S3, if it is still pointless by then.*

### O3-4 — Anonymisation does not scrub quote and document notes
`anonymizeContact` leaves the free-text `notes` on quotes and documents
alone. On a document that is deliberate and load-bearing: it is
räkenskapsinformation, kept seven years. On a **quote** it is a judgement
call — an offert is a commercial record but not a fiscal one, so its notes
could arguably be scrubbed. They are not, because a quote's notes are
normally about the *work* ("takpannor, norra sidan") rather than the person,
and the conservative failure here is leaving a sentence that names nobody
rather than shredding a tenant's record of what they quoted for. Revisit if
a real erasure request turns up a quote note naming the customer.
*Owner: whoever does the pre-launch GDPR review.*

### O2-1 — A PDF cannot draw characters outside WinAnsi
The document PDFs use react-pdf's built-in Helvetica, which encodes WinAnsi and
**silently drops** anything outside it — no error, no placeholder, the glyph is
simply absent. O2 hit this with the U+2212 minus sign that `sv-SE` formats
negative amounts with: every amount on a kreditfaktura lost its sign, so the
credit note printed as an identical copy of the invoice it reversed. That case
is fixed (`pdfMoney` / `toPdfSafe` in `modules/renderable-document/format.ts`),
but the general limitation stands: a product name or customer address
containing, say, Greek or Cyrillic letters, or an emoji, will not render.
The real fix is embedding a Unicode font (`Font.register`), which costs bundle
size and a licensing decision. *Owner: S3 at the latest, or whenever a tenant
reports missing characters.*

### O2-2 — Momssats is resolved at "now" for a draft, not at a document date
`priceLines` resolves a line's momssats against `vat_rates` as of the moment
the draft is saved. That is right — a draft has no date until it is issued —
but it means a draft written just before a rate change and issued just after
carries the old rate. The credit-note path deliberately does the opposite and
prices at the *original's* issue date, which is what makes a credit cancel its
faktura exactly. Re-pricing a draft at issue time was rejected: it would change
amounts the user has already seen and approved, without telling them.
*Owner: none — recorded as a deliberate trade-off. Revisit if Sweden announces
a rate change with a date attached.*

### O2-3 — A faktura can be issued with legally required fields missing
`missingInvoiceFields` warns on the draft screen when the seller's org.nr,
momsregnr or payment account, or the buyer's name or address, are absent — but
issuing is not blocked. Blocking was rejected: it would strand a tenant who has
not filled in their företagsuppgifter and needs to bill someone today, and the
app cannot referee the edge cases (a foreign buyer, an exempt seller) well
enough to be the authority on what is required. *Owner: whoever does the
pre-launch fiscal review; revisit if real tenants ship incomplete invoices.*

### O2-6 — A fresh session's shallow clone tracks only `main`
Sessions in this repo start from `git clone --depth 1`, which sets
`remote.origin.fetch` to `+refs/heads/main:refs/remotes/origin/main`. A phase
branch therefore has no `origin/<branch>` tracking ref locally even after a
successful push, so `git status` shows no upstream and tooling that checks for
unpushed work reports the branch as unpushed when it is fully pushed. Confirm
with `git ls-remote origin refs/heads/<branch>` before believing it, then:

    git config --unset-all remote.origin.fetch
    git config --add remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
    git fetch origin <branch>
    git branch --set-upstream-to=origin/<branch> <branch>

*Owner: none — context for future sessions.*

### O2-5 — Early invoices get a very short OCR number
`generateOcrNumber` strips leading zeros before adding the length and check
digits, so `FA-000001` produces the OCR `0141` — four digits, valid under
Bankgirot's hård kontroll and correctly rejected by a bank if mistyped, but
much shorter than the references Swedish businesses usually send. A tenant may
also expect to recognise the invoice number inside the OCR, which they cannot
at this length. Changing it means picking a minimum reference width and is a
decision about what tenants' banks expect, not a bug in the algorithm — the
generator and its tests are O1's and behave as documented.
*Owner: whoever does the pre-launch fiscal review; S3 at the latest.*

### O2-4 — Partial kreditfaktura is not supported
`createCreditNote` reverses a faktura in full and refuses a second credit
against the same one. Crediting only some lines, or only part of an amount, is
legitimate and reasonably common. It needs a line picker and a rule for what
"already credited" then means, which is more UI than O2's scope allowed.
*Owner: Backlog (plan.md §10).*

### O1-1 — Seeded momssatser carry a placeholder `valid_from` (verify with Skatteverket)
`vat_rates` rows seeded for a new tenant (`src/modules/tenancy/vat-rates.ts`,
migration `0025`) use `2000-01-01` as `valid_from`. That is **not** the
statutory date any Swedish rate took effect — it is a seed value chosen so a
seeded rate applies to every document a new tenant can date. The `source` text
on each row says so and tells the reader to verify with Skatteverket.
Real statutory validity dates should be entered per tenant before the product
is used for real invoicing (plan.md §4.11). *Owner: whoever does the pre-launch
fiscal review; S3 at the latest.*

### O1-3 — `documents.due_at` serves as the plan's `due_date`
plan.md §5.1.5 lists `due_date` among the new document columns, but `due_at`
already existed and already means förfallodatum. A second column would be two
places to say one thing. `delivery_date` (leveransdatum) *was* added, since
that is genuinely a different date. *Owner: none — recorded as a deliberate
deviation.*

### O1-4 — Sequence prefixes are not rewritten for existing tenants
Migration `0025` changes the *default* prefix for new sequences to `FA`/`OFF`
and migrates `doc_type` from `nota_venta` to `faktura`, but leaves the `prefix`
column of existing rows alone: a series that has already printed `NV-000001`
must not silently continue as `FA-000002`. An inherited tenant therefore keeps
its old prefix until someone changes it deliberately. *Owner: none — deliberate.*

### O1-5 — `(PYG)` currency labels are now ICU arguments, but the marketing and
brand surfaces are still Paraguayan
`src/lib/site-config.ts` (`locale: "es-PY"`, contact block), `src/app/layout.tsx`
metadata and `src/app/manifest.ts` still describe a Paraguayan WhatsApp CRM.
That is S1's assignment (plan.md §6.1) and was left untouched here to keep the
phases separable. *Owner: S1.*

**Sharpened in O2 — this one is customer-visible.** Loading a real issued
faktura at `/d/[token]` renders the page under `<title>clientes.com.py</title>`.
That is not an internal-only branding wart: it is the browser tab and the
bookmark title on the page a Swedish tenant sends their customer to pay an
invoice. Worth doing first in S1, ahead of the rest of the sweep.

### O1-6 — Integration suites cannot be run in the build environment *(solved in O2)*
O1 had no reachable MySQL: Docker has no daemon in these containers and the
container registry is blocked by the network policy, so every
`describe.skipIf(!hasDb)` suite was left to CI.

**This is solvable.** `apt-get update && apt-get install -y --no-install-recommends
mariadb-server`, then `mariadbd-safe --user=mysql &`, gives a MySQL-compatible
server the whole suite runs against — migrations included. MariaDB 10.11 ran
every migration and all 709 tests without a dialect problem. Future sessions in
this repo should do that rather than shipping DB-backed changes unverified.
One caveat: `drizzle-kit generate` diffs against MariaDB's introspection and
emits spurious no-op `MODIFY COLUMN` lines for boolean columns — check a
generated migration and delete anything you did not actually change.

**O3 goes one step further: the whole app runs here.** `npm run build` then
`npx next start -p 3100`, seed a tenant with `scripts/seed-tenant.ts`, and
sign in over the auth API with curl:

    curl -s -c /tmp/c.txt -X POST localhost:3100/api/auth/sign-in/email \
      -H 'Content-Type: application/json' \
      -d '{"email":"…","password":"…"}'

then `curl -b /tmp/c.txt` any page. That is worth the ten minutes: it is how
O3 found that `/inbox` was answering **200** with the 404 page in its body
(see the O3 build-log entry), which every test and the build agreed was
fine. Two traps: `NODE_ENV=development` in `.env` makes `next build` fail
while prerendering `/404`, and `pkill -f "next start"` matches its own shell
— kill `next-server` instead.
*Owner: none — context for future sessions.*

## Closed

Fixed in a Sonnet pass on 2026-08-29 (verified against MariaDB per O1-6/O2-6,
`npx tsc --noEmit`, `next build`, and the full `vitest` suite — 730 passing,
same pre-existing DB-unavailable and env-secret failures before and after):

- **S2-1** — Sites guide's example URL used the Spanish placeholder
  `tu-empresa`/`contacto`; now `mitt-företag`/`kontakt`.
- **S1-2** — `src/app/layout.tsx` now passes `NextIntlClientProvider` only
  the namespaces a Client Component actually reads (`common`, `auth`, `app`,
  `superadmin`, `errors`), instead of the whole resolved locale. `marketing`,
  `pdf`, `email`, `audit`, `public` and `tenancy` are server-only and no
  longer ship to the browser on every page.
- **O3-3** — The two WhatsApp template-language defaults (`modules/automations/actions.ts`,
  the flow editor) now default to `"sv"` instead of `"es"`.
- **O3-5** — `deliverQueuedMessage` (the `whatsapp.send` job handler) now
  re-checks the tenant's WhatsApp flag before calling the Graph API, not
  just at enqueue time, and fails the message rather than sending it if the
  channel was switched off in between. Covered by a new test in
  `feature.test.ts`.
- **O1-2** — `modules/tenancy/context.ts`'s `"Se requiere rol de administrador"`
  is now `"Admin role required"`, matching its English sibling in the same
  function.
- Also found and fixed, same class as O1-2 but not previously tracked:
  Spanish strings thrown from `modules/whatsapp/send.ts` (the 24h-window
  error, both call sites), `modules/leads/submissions.ts`,
  `modules/sites/sites.ts`, and `modules/crm/contact-views.ts`.

Reviewed and deliberately left open (not quick fixes — see the entries
above): **O3-2** (WhatsApp-health console also hosts unrelated platform job
monitoring), **O2-1** (embedding a Unicode PDF font needs a font/licensing
decision), and everything gated on a real business or fiscal-review decision
(O1-1, O2-3, O2-4, O2-5, O3-4).

---

## Inherited from vendercrm/main (wave 1/2, P1-P17, K1-K3, O1/O2)

Carried over as documentation of caveats in the vendercrm features this fork
now also has, ported by the 2026-09 catch-up merge. Not yet re-triaged against
the Swedish edition specifically.

# Known issues

Cross-phase items still open after wave 1 (P1–P7, PLAN.md §15.5/§15.8) and
wave 2 lane 2 (P13–P17, §17.2/§17.3), promoted from each phase's own
`docs/log/pN.md`. None of these block a deploy — every one is a deliberate
deferral or a scale tradeoff, documented at the time rather than fixed then
and there because it was out of that phase's Owns column or its exit
criteria didn't ask for it. Fixing one is fair game for whichever future
phase touches that file next.

- **`notify_user`'s notification always links to `/contacts/<id>`** (P1),
  never a deal- or document-specific URL, even when the automation step that
  created it fired from one of those.
- **The notifications bell's unread count is computed in Node**, not with a
  SQL `COUNT(*)` (P1) — reads all of a user's recent rows to count them.
  Fine at the bell's current scale (ten rows).
- **A user removed from a tenant keeps their `push_subscriptions` rows**
  (P2). Nothing is delivered to them — the active-membership check refuses
  the send before it reaches their device — so this is dead weight, not a
  leak.
- **Web-chat conversations in `/inbox` have no filter or search of their
  own** (P3) — `?filter=` and `?q=` apply only to WhatsApp rows; only
  `/chat`'s own status filter narrows the web-chat ones.
- **`/u/[token]` (email unsubscribe) mutates on a plain GET** (P4) — the
  same pattern most one-click unsubscribe links use, but a mail client's
  link-prefetcher visiting it early can trigger a false unsubscribe.
- **Deleting a custom field definition leaves its values in
  `contacts.custom`** (P5) — dead JSON keys, harmless since nothing reads a
  key with no definition, but no cleanup pass exists.
- **`renderContactCustomVars` (custom-field template variables) is not
  wired into the automation template engine** (P5) — `{{contacto.custom.*}}`
  resolves in code but no flow action can reference it yet.
- **`expireQuotes` and `coach.morning`'s digest check each walk every tenant
  on the platform per run** (P6, P7) — correct and fine at current scale;
  would want a per-tenant cursor or batching if the tenant count grows by
  orders of magnitude.
- **The public quote accept/reject form has no CAPTCHA** (P6) — a per-IP
  rate limit (10/min) is the only abuse guard, the same posture the
  pre-existing `/q/[token]` view already had.
- ~~`negocio.*` template variables are not resolvable yet~~ — **fixed by
  K3** (`docs/log/k3.md`): registered in `contracts/render.ts` and wired
  into the quote/nota de venta PDF footers.
- **No drawn-signature pad for contracts** (P13) — click-to-accept is the
  whole flow per §17.1 #5; `contract_acceptances.signature_storage_key`
  exists and nothing writes to it.
- **`sendContractByEmailAction` doesn't flip contract status or write its
  own timeline activity** (P13), separately from the WhatsApp send — the
  same precedent `sendQuoteByEmailAction` already set for quotes.
- **The WhatsApp `briefing_semanal` template is never submitted by P14** —
  an admin has to create and get it approved in Meta first; until then the
  WhatsApp copy of the weekly briefing is silently skipped.
- **`sendWeeklyBriefings` iterates every tenant on the platform once an
  hour** (P14), same posture and scaling caveat as `sendMorningDigests`.
- **No campaigns table in `/reports` yet** (P15) — resolved automatically
  once P10 (lane 1) merges and adds the fourth table.
- **`getSalesReport` runs twice per page load** (P15, current + previous
  window) — fine at today's per-tenant data volume.
- **The response-time distribution and stage funnel in `/reports` have no
  comparison column** (P15) — only the keyed tables (sources, sites) do.
- **The `/contacts` duplicates panel re-scans every contact on every page
  load** (P16) — fine at today's per-tenant contact volumes, an O(n²)
  pairwise comparison worth caching if that grows large.
- **No bulk "merge all found duplicates" action** (P16) — each pair is
  reviewed and merged one at a time, deliberately, since merges aren't
  reversible.
- **A ticked `consent_whatsapp` checkbox on a form does not stamp
  `contacts.wa_marketing_consent_at`** (P17) — that column doesn't exist on
  `main` yet (P10, lane 1, not merged when this phase ran). The `checkbox`
  field type still ships and a tenant can add the field today; wiring the
  actual consent write is a one-line follow-up once P10 merges.
- ~~K3 (memory imports, template variables, coach rows) was skipped
  entirely this wave~~ — **built** (`docs/log/k3.md`): `memory_imports` is
  now read/written by `/settings/negocio/importar`; `negocio.*` variables
  and the three memory-upkeep Hoy rows are live. `renderTemplateVars`
  (automations flow messages) still does not resolve `negocio.*` — K3
  scoped that out, see its log's decision 3.
- **Claude Ops tokens have no UI until O2** (O1) — `npm run create-ops-token`
  prints one, and cannot set an expiry or an allowlisted tenant; both are the
  console's to add. Nothing in the ops API deletes anything, so a
  half-provisioned row is finished, corrected or left alone by hand.
- **An ops-provisioned site carries one revoked `site_api_keys` row** (O1) —
  the key `createSite` issues automatically is revoked immediately, because
  its plaintext is discarded and the ops key step issues the one the website
  actually holds.
- **Explicit stage names given to the ops pipeline step are created without
  won/lost flags** (O1) — a custom set has no `is_won` stage until someone
  marks it in the CRM; omitting `stages` uses the flagged default set.
