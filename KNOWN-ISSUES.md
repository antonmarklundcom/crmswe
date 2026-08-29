# Known issues

Minor, non-blocking findings recorded per the autonomy protocol (plan.md §4.3)
instead of stopping a phase. Each entry says who should pick it up.

## Open

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
*Owner: none — context for future sessions.*
