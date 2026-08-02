"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { parseMinorUnits, previewTotals } from "@/lib/money";
import {
  createDocumentAction,
  updateDraftDocumentAction,
  type DocumentFormState,
  type UpdateDocumentFormState,
} from "./actions";

// Declared here, not in actions.ts: a "use server" module may only export
// async functions.
const createInitialState: DocumentFormState = {
  error: null,
  field: null,
  values: { contactId: "" },
};
const updateInitialState: UpdateDocumentFormState = { error: null, values: { contactId: "" } };

type Contact = { id: string; label: string };
type Product = { id: string; name: string; unitPrice: number };

export type DocumentBuilderLabels = {
  contact: string;
  description: string;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  addLine: string;
  removeLine: string;
  fromCatalog: string;
  freeText: string;
  discount: string;
  dueAt: string;
  notes: string;
  subtotal: string;
  total: string;
  submit: string;
};

// Amounts are held as raw strings, not numbers: the inputs are
// inputMode="numeric" rather than type="number" (see the fields below), so
// what the user typed is what gets posted, and the server is the only thing
// that decides whether it's valid.
type Line = {
  key: number;
  productId: string;
  description: string;
  qty: string;
  unitPrice: string;
};

// What an existing draft supplies: real integers off the row, converted to
// strings once as the builder's state is seeded.
type InitialLine = {
  key: number;
  productId: string;
  description: string;
  qty: number;
  unitPrice: number;
};

let nextKey = 1;
const blankLine = (): Line => ({
  key: nextKey++,
  productId: "",
  description: "",
  qty: "1",
  unitPrice: "0",
});

type CreateProps = {
  mode: "create";
  contacts: Contact[];
  products: Product[];
  labels: DocumentBuilderLabels;
};

type EditProps = {
  mode: "edit";
  documentId: string;
  products: Product[];
  labels: DocumentBuilderLabels;
  initial: {
    lines: InitialLine[];
    discount: number;
    dueAt: string;
    notes: string;
  };
};

export function DocumentBuilder(props: CreateProps | EditProps) {
  const { products, labels } = props;
  const t = useTranslations("app.documents");
  const [lines, setLines] = useState<Line[]>(() =>
    props.mode === "edit" && props.initial.lines.length > 0
      ? props.initial.lines.map((line) => ({
          ...line,
          qty: String(line.qty),
          unitPrice: String(line.unitPrice),
        }))
      : [blankLine()],
  );
  const [discount, setDiscount] = useState(
    props.mode === "edit" ? String(props.initial.discount) : "0",
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
      ...(product ? { description: product.name, unitPrice: String(product.unitPrice) } : {}),
    });
  }

  // The preview parses the same strings the server will, and goes blank
  // wherever the server would refuse the value — a displayed total is either
  // the one that will be stored or nothing at all.
  const totals = previewTotals(lines, discount);
  const fmt = (n: number) => new Intl.NumberFormat("es-PY").format(n);
  const blank = "—";
  function lineTotal(line: Line) {
    const qty = parseMinorUnits(line.qty);
    const unitPrice = parseMinorUnits(line.unitPrice);
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
          <select
            name="contactId"
            defaultValue={createState.values.contactId}
            className="rounded-md border px-3 py-2"
          >
            <option value="" disabled>
              {labels.contact}
            </option>
            {props.contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.label}
              </option>
            ))}
          </select>
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
              <select
                value={line.productId}
                onChange={(e) => pickProduct(line.key, e.target.value)}
                className="rounded-md border px-2 py-1"
              >
                <option value="">{labels.freeText}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
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
                inputMode="numeric"
                value={line.unitPrice}
                onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                className="rounded-md border px-2 py-1"
              />
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
          onClick={() => setLines((prev) => [...prev, blankLine()])}
        >
          {labels.addLine}
        </Button>
      </div>

      <div className="flex max-w-sm flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {labels.discount}
          <input
            name="discount"
            inputMode="numeric"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.dueAt}
          <input
            name="dueAt"
            type="date"
            defaultValue={props.mode === "edit" ? props.initial.dueAt : undefined}
            className="rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.notes}
          <textarea
            name="notes"
            defaultValue={props.mode === "edit" ? props.initial.notes : undefined}
            className="rounded-md border px-3 py-2"
          />
        </label>
      </div>

      <div className="flex flex-col items-end gap-1 text-sm">
        <div className="flex w-56 justify-between">
          <span>{labels.subtotal}</span>
          <span>{totals ? fmt(totals.subtotal) : blank}</span>
        </div>
        <div className="flex w-56 justify-between text-base font-semibold">
          <span>{labels.total}</span>
          <span>{totals ? fmt(totals.total) : blank}</span>
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
