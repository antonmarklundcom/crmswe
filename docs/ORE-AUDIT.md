# Öre audit — every money path in the app (phase O1)

`plan.md` §1.2 changed what an integer amount *means*: the inherited build
stored whole guaraníes, this one stores **öre**. Nothing about the column types
changed, which is exactly what makes the change dangerous — a path that was
never revisited shows amounts 100× wrong and still typechecks.

This is the grep-driven checklist O1 worked through. It is kept in the repo
because O2 adds moms to every one of these paths and will need the same map.

## How to regenerate the raw list

```bash
rg -n 'formatMoney|renderable-document/format|formatNumber' src
rg -n 'coerce\.number|parseMoneyInput|parseMoneyInput|unitPrice|amount|discount|value' src/app --glob '*actions.ts'
rg -n 'PYG|currency' src messages scripts
rg -n 'toLocaleString' src
```

## The three crossings

| Crossing | The rule | Where it lives |
|---|---|---|
| Typed → stored | major units in, minor units out | `parseMoneyInput` (`src/lib/money.ts`), wrapped as `moneyAmountSchema` (`src/lib/money-schema.ts`) |
| Stored → shown | minor units in, localized currency out | `formatMoney` (`src/lib/i18n/format.ts`), re-exported for documents as `money` |
| Stored → editable | minor units in, editable major-unit string out | `formatMoneyInput` (`src/lib/money.ts`) |

Aggregation needs no conversion: minor units sum as integers. What it *does*
need is a single currency — see the dashboard row below.

## Checklist

### Display

- [x] `src/lib/i18n/format.ts` `formatMoney` — was `"1 500 000 PYG"`, now
      `Intl` currency style with the currency's own fraction digits, fed an
      exact decimal string rather than `value / 100`.
- [x] `src/modules/renderable-document/format.ts` `money` — was a second,
      disagreeing renderer; now delegates to `formatMoney`.
- [x] `src/modules/quotes/pdf.tsx`, `src/modules/documents/pdf.tsx` — via
      `money`; digests in `pdf.test.tsx` re-pinned against a Swedish fixture.
- [x] `src/app/(public)/q/[token]`, `src/app/(public)/d/[token]` — via `money`.
- [x] `src/modules/crm/search.ts` — palette hits, via `formatMoney`.
- [x] `src/app/(app)/{quotes,documents,products,reports,contacts,pipeline}` —
      already via `formatMoney`; correct once the formatter was.
- [x] `src/app/(app)/dashboard/page.tsx` — was `formatNumber` on a money
      value, now `formatMoney` with the tenant's currency.
- [x] `src/app/(superadmin)/plans/page.tsx` — same fix, platform currency.
- [x] Quote/document builder line and total previews — were `formatNumber`.
- [x] `src/components/audit-table.tsx`, `src/app/(superadmin)/whatsapp-health`
      — hardcoded `toLocaleString("es-PY")`, now the shared date formatter.

### Parse (the 100× trap)

- [x] `src/app/(app)/quotes/actions.ts` — line `unitPrice`, `discount`.
- [x] `src/app/(app)/documents/actions.ts` — line `unitPrice`, `discount`
      (create and update), payment `amount`.
- [x] `src/app/(app)/products/actions.ts` — `unitPrice`.
- [x] `src/app/(app)/pipeline/actions.ts` — deal `value`.
- [x] `src/app/(superadmin)/plans/actions.ts` — plan `price`.
- [x] `src/app/(superadmin)/tenants/[id]/actions.ts` — payment `amount`.
- [x] `src/modules/quotes/products-csv.ts` — **both** directions. The CSV
      column is major units on export and import; a round-trip test pins it,
      because an export in öre read back as kronor is the 100× bug in its
      purest form.
- [x] Builder previews (`QuoteBuilder`, `DocumentBuilder`) parse exactly what
      the server parses, so a preview is either the stored number or blank.
- [x] Catalog product picker fills the price box with `formatMoneyInput`, not
      the raw integer.

### Aggregate

- [x] `src/modules/dashboard/summary.ts` — `openDealsValuePyg` was filtered on
      the literal `"PYG"`, so a Swedish tenant's headline was always 0. Now
      `openDealsValue` + `currency`, filtered on the tenant's own currency.
- [x] `src/modules/reports/sales.ts` — won-value currency fell back to
      `"PYG"`; now the tenant's currency.
- [x] `src/lib/money.ts` `computeLineTotals` — integer arithmetic throughout,
      unchanged and still correct in minor units.
- [x] `src/modules/documents/types.ts` `balanceOf`/`paymentStateOf` — integer
      comparisons, unchanged.

### Defaults

- [x] Column defaults `'PYG'` → `'SEK'` on `deals`, `products`, `quotes`,
      `documents`, `document_payments`, `payments` (migration 0025).
- [x] Service-layer `?? "PYG"` → `?? ctx.currency` (deals, products, quotes,
      documents) or the platform currency (subscriptions).
- [x] `tenants.currency` added, carried on `TenantContext`.

## What is deliberately not converted

Existing rows keep the currency they were written with. An amount is minor
units **of the row's own currency**, so an inherited `PYG` row still means
whole guaraníes and still formats correctly — no data rewrite, and no window
where a row's number and its currency disagree.
