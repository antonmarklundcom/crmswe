"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createQuoteAction, type QuoteFormState } from "./actions";

// Declared here, not in actions.ts: a "use server" module may only export
// async functions.
const initialState: QuoteFormState = { error: null, field: null, values: { contactId: "" } };

type Contact = { id: string; label: string };
type Product = { id: string; name: string; unitPrice: number };

export type BuilderLabels = {
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
  validUntil: string;
  notes: string;
  subtotal: string;
  total: string;
  create: string;
};

type Line = { key: number; productId: string; description: string; qty: number; unitPrice: number };

let nextKey = 1;
const blankLine = (): Line => ({ key: nextKey++, productId: "", description: "", qty: 1, unitPrice: 0 });

export function QuoteBuilder({
  contacts,
  products,
  labels,
}: {
  contacts: Contact[];
  products: Product[];
  labels: BuilderLabels;
}) {
  const t = useTranslations("app.quotes");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [discount, setDiscount] = useState(0);
  const [state, formAction, pending] = useActionState(createQuoteAction, initialState);

  function update(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  // Picking a catalog product fills description and price but leaves both
  // editable — §8 allows free-text lines alongside the catalog.
  function pickProduct(key: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    update(key, {
      productId,
      ...(product ? { description: product.name, unitPrice: product.unitPrice } : {}),
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const appliedDiscount = Math.min(Math.max(discount, 0), subtotal);
  const fmt = (n: number) => new Intl.NumberFormat("es-PY").format(n);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex max-w-sm flex-col gap-1 text-sm">
        {labels.contact}
        <select
          name="contactId"
          defaultValue={state.values.contactId}
          className="rounded-md border px-3 py-2"
        >
          <option value="" disabled>
            {labels.contact}
          </option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.label}
            </option>
          ))}
        </select>
        {state.field === "contactId" && state.error && (
          <span role="alert" className="text-xs text-destructive">
            {t(`errors.${state.error}` as "errors.unknown")}
          </span>
        )}
      </label>

      <div className="flex flex-col gap-2">
        {lines.map((line) => (
          <div key={line.key} className="flex flex-wrap items-end gap-2 rounded-md border p-2 text-sm">
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
              <input
                name="qty"
                type="number"
                min={1}
                value={line.qty}
                onChange={(e) => update(line.key, { qty: Number(e.target.value) })}
                className="rounded-md border px-2 py-1"
              />
            </label>

            <label className="flex w-32 flex-col gap-1">
              {labels.unitPrice}
              <input
                name="unitPrice"
                type="number"
                min={0}
                step={1}
                value={line.unitPrice}
                onChange={(e) => update(line.key, { unitPrice: Number(e.target.value) })}
                className="rounded-md border px-2 py-1"
              />
            </label>

            <span className="w-32 text-right">{fmt(line.qty * line.unitPrice)}</span>

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
            type="number"
            min={0}
            step={1}
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
            className="rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.validUntil}
          <input name="validUntil" type="date" className="rounded-md border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.notes}
          <textarea name="notes" className="rounded-md border px-3 py-2" />
        </label>
      </div>

      <div className="flex flex-col items-end gap-1 text-sm">
        <div className="flex w-56 justify-between">
          <span>{labels.subtotal}</span>
          <span>{fmt(subtotal)}</span>
        </div>
        <div className="flex w-56 justify-between text-base font-semibold">
          <span>{labels.total}</span>
          <span>{fmt(subtotal - appliedDiscount)}</span>
        </div>
      </div>

      {state.error && state.field === null && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.unknown")}
        </p>
      )}

      <Button type="submit" className="w-fit" disabled={pending}>
        {labels.create}
      </Button>
    </form>
  );
}
