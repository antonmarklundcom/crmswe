# Known issues

Minor, non-blocking findings recorded per the autonomy protocol (plan.md §4.3)
instead of stopping a phase. Each entry says who should pick it up.

## Open

### O1-1 — Seeded momssatser carry a placeholder `valid_from` (verify with Skatteverket)
`vat_rates` rows seeded for a new tenant (`src/modules/tenancy/vat-rates.ts`,
migration `0025`) use `2000-01-01` as `valid_from`. That is **not** the
statutory date any Swedish rate took effect — it is a seed value chosen so a
seeded rate applies to every document a new tenant can date. The `source` text
on each row says so and tells the reader to verify with Skatteverket.
Real statutory validity dates should be entered per tenant before the product
is used for real invoicing (plan.md §4.11). *Owner: whoever does the pre-launch
fiscal review; S3 at the latest.*

### O1-2 — Spanish strings still in thrown service errors
`modules/documents/documents.ts`, `modules/quotes/quotes.ts` and
`modules/tenancy/context.ts` throw messages like `"La nota de venta necesita al
menos un ítem"`. They never reach a user (the actions catch them and return an
i18n key), but they read wrong in a log. *Owner: O2 for the documents module
(§5.2.6 renames those surfaces anyway); S1 for the rest.*

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

### O1-6 — Integration suites cannot be run in the O1 build environment
The build session had no reachable MySQL (the container registry is blocked by
the network policy), so every `describe.skipIf(!hasDb)` suite was verified by
CI rather than locally. Anything that only CI can catch — the migration itself
above all — is worth a second look on the next red build. *Owner: none —
context for future sessions.*
