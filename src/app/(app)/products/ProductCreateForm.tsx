"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createProductAction, type ProductField, type ProductFormState } from "./actions";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions.
const initialState: ProductFormState = { error: null, field: null, values: {} };

export function ProductCreateForm() {
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
        <input
          name="name"
          defaultValue={state.values.name ?? ""}
          className="rounded-md border px-3 py-2"
        />
        <FieldError field="name" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("description")}
        <textarea
          name="description"
          defaultValue={state.values.description ?? ""}
          className="rounded-md border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("unitPrice")}
        {/* Not type="number": it defaults to step="1", silently blocking a
            decimal like "1.5" with a browser bubble in the browser's own
            language before the Spanish message can run (§1.2). */}
        <input
          name="unitPrice"
          inputMode="numeric"
          defaultValue={state.values.unitPrice ?? ""}
          className="rounded-md border px-3 py-2"
        />
        <FieldError field="unitPrice" />
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
