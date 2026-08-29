"use client";

import { useActionState, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  formatMoneyInput,
  parseMoneyInput,
  parseQuantity,
  previewTotals,
} from "@/lib/money";
import { formatRateLabel } from "@/lib/se/moms";
import { useEchoGeneration } from "@/lib/use-echo-generation";
import {
  createDocumentAction,
  updateDraftDocumentAction,
  type DocumentFormState,
  type UpdateDocumentFormState,
} from "./actions";
import { formatMoney } from "@/lib/i18n/format";
import { Input, Select, Textarea } from "@/components/ui/form-fields";

// Declared here, not in actions.ts: a "use server" module may only export
// async functions.
const createInitialState: DocumentFormState = {
  error: null,
  field: null,
  values: { contactId: "" },
};
const updateInitialState: UpdateDocumentFormState = { error: null, values: { contactId: "" } };

type Contact = { id: string; label: string };
type Product = { id: string; name: string; unitPrice: number; vatRateBps: number | null };

export type DocumentBuilderLabels = {
  contact: string;
  description: string;
  qty: string;
  unitPrice: string;
  vatRate: string;
  lineTotal: string;
  addLine: string;
  removeLine: string;
  fromCatalog: string;
  freeText: string;
  discount: string;
  dueAt: string;
  deliveryDate: string;
  notes: string;
  subtotal: string;
  net: string;
  vatTotal: string;
  total: string;
  submit: string;
};

/** A momssats the tenant has configured — the picker's options never come
 * from a constant in code (plan.md §4.11). */
export type VatRateOption = { rateBps: number; label: string };

// Amounts are held as raw strings, not numbers: the inputs are
// inputMode="decimal" rather than type="number" (see the fields below), so
// what the user typed is what gets posted, and the server is the only thing
// that decides whether it's valid. The string is a *major-unit* amount —
// "1 495,50" — which parseMoneyInput turns into öre on both sides (plan.md
// §1.2).
type Line = {
  key: number;
  productId: string;
  description: string;
  qty: string;
  /** Major units, exklusive moms — what the user types. */
  unitPrice: string;
  /** Momssats in basis points, as a string because it is a select value. */
  vatRateBps: string;
};

// What an existing draft supplies: real integers off the row, converted to
// strings once as the builder's state is seeded.
type InitialLine = {
  key: number;
  productId: string;
  description: string;
  qty: number;
  unitPrice: number;
  vatRateBps: number | null;
};

let nextKey = 1;
const blankLine = (defaultRateBps: number): Line => ({
  key: nextKey++,
  productId: "",
  description: "",
  qty: "1",
  unitPrice: "0",
  vatRateBps: String(defaultRateBps),
});

type CreateProps = {
  mode: "create";
  contacts: Contact[];
  products: Product[];
  labels: DocumentBuilderLabels;
  /** The tenant's currency — decides how many decimals an amount may carry. */
  currency: string;
  /** The tenant's configured momssatser, highest first. */
  vatRates: VatRateOption[];
};

type EditProps = {
  mode: "edit";
  documentId: string;
  products: Product[];
  labels: DocumentBuilderLabels;
  currency: string;
  vatRates: VatRateOption[];
  initial: {
    lines: InitialLine[];
    discount: number;
    dueAt: string;
    deliveryDate: string;
    notes: string;
  };
};

export function DocumentBuilder(props: CreateProps | EditProps) {
  const { products, labels, currency, vatRates } = props;
  const t = useTranslations("app.documents");
  // The tenant's first configured rate is the picker's default. Never 2500 in
  // code: a momsbefriad tenant's default is 0 %, and only their configuration
  // knows that (plan.md §4.11).
  const defaultRateBps = vatRates[0]?.rateBps ?? 0;
  const [lines, setLines] = useState<Line[]>(() =>
    props.mode === "edit" && props.initial.lines.length > 0
      ? props.initial.lines.map((line) => ({
          ...line,
          qty: String(line.qty),
          unitPrice: formatMoneyInput(line.unitPrice, currency),
          vatRateBps: String(line.vatRateBps ?? defaultRateBps),
        }))
      : [blankLine(defaultRateBps)],
  );
  const [discount, setDiscount] = useState(
    props.mode === "edit" ? formatMoneyInput(props.initial.discount, currency) : "0",
  );
  // Both hooks run unconditionally — mode doesn't change once a builder is
  // mounted — and the render below picks whichever the props say to use.
  const [createState, createFormAction, createPending] = useActionState(
    createDocumentAction,
    createInitialState,
  );
  const [updateState, updateFormAction, updatePending] = useActionState(
    updateDraftDocumentAction,
    updateInitialState,
  );
  const state = props.mode === "create" ? createState : updateState;
  // The contact picker only renders in create mode, but the generation has
  // to follow whichever state is live so the hook is called unconditionally.
  const generation = useEchoGeneration(state);
  const formAction = props.mode === "create" ? createFormAction : updateFormAction;
  const pending = props.mode === "create" ? createPending : updatePending;

  function update(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  // Picking a catalog product fills description and price but leaves both
  // editable — same allowance as the quote builder (§8).
  function pickProduct(key: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    update(key, {
      productId,
      ...(product
        ? {
            description: product.name,
            unitPrice: formatMoneyInput(product.unitPrice, currency),
            // A product carries its own momssats — books are 6 %, a service
            // 25 % — so picking one sets the rate too, still editable after.
            ...(product.vatRateBps !== null
              ? { vatRateBps: String(product.vatRateBps) }
              : {}),
          }
        : {}),
    });
  }

  // The preview runs the *same* moms engine the server will, on the same
  // parsed values, so what the builder shows is what gets stored — including
  // the öre-level rounding, which is the whole reason not to approximate it
  // here. It goes blank wherever the server would refuse a value, rather than
  // showing a total the saved document won't match.
  const totals = previewTotals(lines, discount, currency);
  const locale = useLocale();
  const fmt = (n: number) => formatMoney(n, currency, locale);
  const blank = "—";


  function lineTotal(line: Line) {
    const qty = parseQuantity(line.qty);
    const unitPrice = parseMoneyInput(line.unitPrice, currency);
    if (qty === null || qty < 1 || unitPrice === null || unitPrice < 0) return blank;
    return fmt(qty * unitPrice);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {props.mode === "edit" && (
        <input type="hidden" name="documentId" value={props.documentId} />
      )}

      {props.mode === "create" && (
        <label className="flex max-w-sm flex-col gap-1 text-sm">
          {labels.contact}
          {/* Remounted per action result so the echoed contact survives a
              rejected submit — see useEchoGeneration for why `defaultValue`
              alone, and a controlled value, both fail here. */}
          <Select
            key={generation}
            name="contactId"
            defaultValue={createState.values.contactId}
          >
            <option value="" disabled>
              {labels.contact}
            </option>
            {props.contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.label}
              </option>
            ))}
          </Select>
          {createState.field === "contactId" && createState.error && (
            <span role="alert" className="text-xs text-destructive">
              {t(`errors.${createState.error}` as "errors.unknown")}
            </span>
          )}
        </label>
      )}

      <div className="flex flex-col gap-2">
        {lines.map((line) => (
          <div
            key={line.key}
            className="flex flex-wrap items-end gap-2 rounded-md border p-2 text-sm"
          >
            <label className="flex flex-col gap-1">
              {labels.fromCatalog}
              <Select
                value={line.productId}
                onChange={(e) => pickProduct(line.key, e.target.value)}
                className="px-2 py-1"
              >
                <option value="">{labels.freeText}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </Select>
            </label>
            <input type="hidden" name="productId" value={line.productId} />

            <label className="flex flex-1 flex-col gap-1">
              {labels.description}
              <input
                name="description"
                value={line.description}
                onChange={(e) => update(line.key, { description: e.target.value })}
                className="rounded-md border px-2 py-1"
              />
            </label>

            <label className="flex w-20 flex-col gap-1">
              {labels.qty}
              {/* Not type="number": its implicit step="1" rejects a decimal
                  with a browser bubble in the *browser's* language, before
                  the app's Spanish message can run (§1.2). The server
                  answers instead. */}
              <input
                name="qty"
                inputMode="numeric"
                value={line.qty}
                onChange={(e) => update(line.key, { qty: e.target.value })}
                className="rounded-md border px-2 py-1"
              />
            </label>

            <label className="flex w-32 flex-col gap-1">
              {labels.unitPrice}
              <input
                name="unitPrice"
                inputMode="decimal"
                value={line.unitPrice}
                onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                className="rounded-md border px-2 py-1"
              />
            </label>

            <label className="flex w-40 flex-col gap-1">
              {labels.vatRate}
              {/* Options come from the tenant's vat_rates rows, so a
                  momsbefriad business sees only 0 % and nobody can pick a
                  rate their configuration does not have. */}
              <Select
                name="vatRateBps"
                value={line.vatRateBps}
                onChange={(e) => update(line.key, { vatRateBps: e.target.value })}
                className="px-2 py-1"
              >
                {vatRates.map((rate) => (
                  <option key={rate.rateBps} value={rate.rateBps}>
                    {rate.label}
                  </option>
                ))}
              </Select>
            </label>

            <span className="w-32 text-right">{lineTotal(line)}</span>

            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                className="text-xs underline"
              >
                {labels.removeLine}
              </button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setLines((prev) => [...prev, blankLine(defaultRateBps)])}
        >
          {labels.addLine}
        </Button>
      </div>

      <div className="flex max-w-sm flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {labels.discount}
          <Input
            name="discount"
            inputMode="decimal"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.dueAt}
          <Input
            name="dueAt"
            type="date"
            defaultValue={props.mode === "edit" ? props.initial.dueAt : undefined}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.deliveryDate}
          <Input
            name="deliveryDate"
            type="date"
            defaultValue={props.mode === "edit" ? props.initial.deliveryDate : undefined}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.notes}
          <Textarea
            name="notes"
            defaultValue={props.mode === "edit" ? props.initial.notes : undefined}
          />
        </label>
      </div>

      <div className="flex flex-col items-end gap-1 text-sm">
        <div className="flex w-64 justify-between">
          <span>{labels.subtotal}</span>
          <span>{totals ? fmt(totals.subtotal) : blank}</span>
        </div>
        {totals && totals.discount !== 0 && (
          <div className="flex w-64 justify-between">
            <span>{labels.net}</span>
            <span>{fmt(totals.net)}</span>
          </div>
        )}
        {/* Per-rate, so a mixed-rate document shows where its moms comes
            from before it is ever issued. */}
        {totals?.summary.map((row) => (
          <div key={row.rateBps} className="flex w-64 justify-between text-muted-foreground">
            <span>
              {labels.vatTotal} {formatRateLabel(row.rateBps)}
            </span>
            <span>{fmt(row.vat)}</span>
          </div>
        ))}
        <div className="flex w-64 justify-between">
          <span>{labels.vatTotal}</span>
          <span>{totals ? fmt(totals.vatTotal) : blank}</span>
        </div>
        <div className="flex w-64 justify-between text-base font-semibold">
          <span>{labels.total}</span>
          <span>{totals ? fmt(totals.gross) : blank}</span>
        </div>
      </div>

      {state.error && !(props.mode === "create" && createState.field === "contactId") && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.unknown")}
        </p>
      )}

      <Button type="submit" className="w-fit" disabled={pending}>
        {labels.submit}
      </Button>
    </form>
  );
}
