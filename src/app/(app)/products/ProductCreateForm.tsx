"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createProductAction, type ProductField, type ProductFormState } from "./actions";
import { Input, Select, Textarea } from "@/components/ui/form-fields";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions.
const initialState: ProductFormState = { error: null, field: null, values: {} };

/** A momssats the tenant has configured — never a constant in code. */
export type VatRateOption = { rateBps: number; label: string };

export function ProductCreateForm({
  currency,
  vatRates,
}: {
  currency: string;
  vatRates: VatRateOption[];
}) {
  const t = useTranslations("app.products");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(createProductAction, initialState);

  function FieldError({ field }: { field: ProductField }) {
    if (state.field !== field || !state.error) return null;
    return (
      <span role="alert" className="text-xs text-destructive">
        {t(`errors.${state.error}` as "errors.unknown")}
      </span>
    );
  }

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        {t("name")}
        <Input
          name="name"
          defaultValue={state.values.name ?? ""}
        />
        <FieldError field="name" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("description")}
        <Textarea
          name="description"
          defaultValue={state.values.description ?? ""}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("unitPrice", { currency })}
        {/* Not type="number": it defaults to step="1", silently blocking a
            decimal like "1.5" with a browser bubble in the browser's own
            language before the Spanish message can run (§1.2). */}
        <Input
          name="unitPrice"
          inputMode="decimal"
          defaultValue={state.values.unitPrice ?? ""}
        />
        <FieldError field="unitPrice" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("vatRate")}
        {/* Options come from the tenant's own vat_rates rows, so a
            momsbefriad business sees only 0 % (plan.md §4.11). */}
        <Select name="vatRateBps" defaultValue={state.values.vatRateBps ?? ""}>
          {vatRates.map((rate) => (
            <option key={rate.rateBps} value={rate.rateBps}>
              {rate.label}
            </option>
          ))}
        </Select>
        <FieldError field="vatRateBps" />
      </label>
      {state.error && state.field === null && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.unknown")}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {tc("create")}
      </Button>
    </form>
  );
}
