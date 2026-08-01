"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createDocumentAction, updateDraftDocumentAction } from "./actions";

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

type Line = {
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
  qty: 1,
  unitPrice: 0,
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
    lines: Line[];
    discount: number;
    dueAt: string;
    notes: string;
  };
};

export function DocumentBuilder(props: CreateProps | EditProps) {
  const { products, labels } = props;
  const [lines, setLines] = useState<Line[]>(() =>
    props.mode === "edit" && props.initial.lines.length > 0
      ? props.initial.lines
      : [blankLine()],
  );
  const [discount, setDiscount] = useState(
    props.mode === "edit" ? props.initial.discount : 0,
  );

  function update(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  // Picking a catalog product fills description and price but leaves both
  // editable — same allowance as the quote builder (§8).
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

  const action = props.mode === "create" ? createDocumentAction : updateDraftDocumentAction;

  return (
    <form action={action} className="flex flex-col gap-4">
      {props.mode === "edit" && (
        <input type="hidden" name="documentId" value={props.documentId} />
      )}

      {props.mode === "create" && (
        <label className="flex max-w-sm flex-col gap-1 text-sm">
          {labels.contact}
          <select name="contactId" required className="rounded-md border px-3 py-2">
            {props.contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.label}
              </option>
            ))}
          </select>
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
          <span>{fmt(subtotal)}</span>
        </div>
        <div className="flex w-56 justify-between text-base font-semibold">
          <span>{labels.total}</span>
          <span>{fmt(subtotal - appliedDiscount)}</span>
        </div>
      </div>

      <Button type="submit" className="w-fit">
        {labels.submit}
      </Button>
    </form>
  );
}
