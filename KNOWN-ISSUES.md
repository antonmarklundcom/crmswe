# Known issues

Minor, non-blocking findings recorded per the autonomy protocol (plan.md §4.3)
instead of stopping a phase. Each entry says who should pick it up.

## Open

### S2-1 — Sites guide's hosted-form example still shows a Spanish placeholder slug
`src/app/(app)/sites/page.tsx:326` builds the "no backend" iframe example URL
as `` `${env.APP_URL}/f/${tenant?.slug ?? "tu-empresa"}/contacto` `` —
`SiteGuide.tsx` itself was fully translated in S1, but this one call site,
which supplies the *example* tenant slug and form slug when the current
tenant has none, was missed. Out of S2's own hard limit (marketing pages +
components + i18n marketing namespace only), so left alone here rather than
edited. *Owner: whoever next touches `src/app/(app)/sites/`, or S3 at the
latest.*

### S1-2 — The marketing namespace ships in every page's hydration payload, not just marketing pages *(Paraguay-content urgency closed in S2)*
`src/app/layout.tsx` wraps every route in one `<NextIntlClientProvider>`
with no `messages` prop, so next-intl serialises the *entire* resolved
locale's JSON (every namespace) into the client bundle of every page —
`/login`, `/dashboard`, `/pipeline`, all of it — not only the marketing
pages that actually read the `marketing` namespace. This was flagged in S1
because it meant Paraguay-flavoured marketing copy sat in view-source on
every authenticated page; S2's full marketing rewrite removes that content,
so the specific branding concern is gone. The underlying inefficiency is
not: every page's client bundle still carries the whole `marketing`
namespace (FAQ text, form copy, the lot) it never reads. Two ways to close
it properly: scope `NextIntlClientProvider`'s `messages` per route group (root layout
sends only shared + auth namespaces, `(marketing)` layout adds `marketing`)
removes the over-fetch itself and is worth doing on its own merits
independent of branding. *Owner: whoever touches `src/app/layout.tsx` or
`src/i18n/request.ts` next — S2 or S3 are the natural points.*

### O3-5 — Turning WhatsApp off does not cancel already-queued sends
The outbound guard sits in `queueOutboundMessage`, so nothing new is queued
once a tenant switches the channel off. A message queued *before* the switch
is already a `whatsapp.send` job and still goes out when the worker picks it
up. The window is seconds to minutes and the message was authorised while
the channel was on, so draining it is arguably the correct behaviour rather
than a leak — but it is not what "off" reads like. Closing it means the job
handler re-checking the flag before it calls the Graph API.
*Owner: none — recorded as a deliberate edge. Fix if a tenant ever toggles
the channel as a kill switch rather than as configuration.*

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
*Owner: S3, if it is still pointless by then.*

### O3-3 — Two WhatsApp template-language defaults still say `es`
`modules/automations/actions.ts` and the flow editor default a WhatsApp
message template's language code to `"es"`. Both sit inside the WhatsApp
surface, which is hidden by default (§5.3.1), so they are unreachable in the
Swedish product as shipped. Left alone deliberately: changing them buys
nothing while the channel is off and adds a conflict to every vendercrm
cherry-pick through those files (plan.md §1.1). *Owner: whoever first turns
the channel on for a Swedish tenant.*

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

### O1-2 — Spanish strings still in thrown service errors *(mostly closed in O2)*
`modules/documents/documents.ts` and `modules/quotes/quotes.ts` now throw
stable codes (`document_not_draft`, `quote_needs_items`, …), which the actions
map to message keys. What is left is `modules/tenancy/context.ts`:
`"Se requiere rol de administrador"`. *Owner: S1.*

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
