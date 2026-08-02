"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createFlowAction, type FlowFormState } from "./actions";
import { TRIGGER_TYPES } from "@/modules/automations/graph";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions.
const initialState: FlowFormState = { error: null, field: null, values: {} };

export function FlowCreateForm() {
  const t = useTranslations("app.automations");
  const [state, formAction, pending] = useActionState(createFlowAction, initialState);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        {t("name")}
        <input
          name="name"
          defaultValue={state.values.name ?? ""}
          className="rounded-md border px-3 py-2"
        />
        {state.field === "name" && state.error && (
          <span role="alert" className="text-xs text-destructive">
            {t(`errors.${state.error}` as "errors.unknown")}
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("trigger")}
        <select
          name="triggerType"
          defaultValue={state.values.triggerType ?? TRIGGER_TYPES[0]}
          className="rounded-md border px-3 py-2"
        >
          {TRIGGER_TYPES.map((trigger) => (
            <option key={trigger} value={trigger}>
              {t(`triggers.${trigger}` as "triggers.form_submitted")}
            </option>
          ))}
        </select>
      </label>
      {state.error && state.field === null && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.unknown")}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {t("createFlow")}
      </Button>
    </form>
  );
}
