"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createPlanAction, type PlanField, type PlanFormState } from "./actions";
import { Input, Select } from "@/components/ui/form-fields";
import { DEFAULT_CURRENCY } from "@/lib/money";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions.
const initialState: PlanFormState = { error: null, field: null, values: {} };

export function CreatePlanForm() {
  const t = useTranslations("superadmin.plans");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(createPlanAction, initialState);

  function FieldError({ field }: { field: PlanField }) {
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
        {t("durationMonths")}
        <Select
          name="durationMonths"
          defaultValue={state.values.durationMonths ?? "3"}
        >
          <option value="3">3</option>
          <option value="6">6</option>
          <option value="12">12</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("price", { currency: DEFAULT_CURRENCY })}
        {/* Not type="number": it defaults to step="1" and blocks a decimal
            with a browser bubble in the browser's language before the
            Spanish message can run (§1.2). */}
        <Input
          name="price"
          inputMode="decimal"
          defaultValue={state.values.price ?? ""}
        />
        <FieldError field="price" />
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
