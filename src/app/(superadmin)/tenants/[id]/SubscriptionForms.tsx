"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useEchoGeneration } from "@/lib/use-echo-generation";
import { DEFAULT_CURRENCY } from "@/lib/money";
import {
  createSubscriptionAction,
  recordPaymentAction,
  type RecordPaymentField,
  type RecordPaymentFormState,
  type SubscriptionField,
  type SubscriptionFormState,
} from "./actions";
import { Input, Select, Textarea } from "@/components/ui/form-fields";

// Both forms here have a real user-fillable field (the plan picker, the
// amount), so both get the useActionState treatment from PLAN.md §10 1R #6
// instead of throwing into Next's error page. Initial state lives here, not
// in actions.ts: a "use server" module may only export async functions.

const subscriptionInitialState: SubscriptionFormState = {
  error: null,
  field: null,
  values: {},
};

export function CreateSubscriptionForm({
  tenantId,
  plans,
}: {
  tenantId: string;
  plans: { id: string; name: string }[];
}) {
  const ts = useTranslations("superadmin.subscriptions");
  const [state, formAction, pending] = useActionState(
    createSubscriptionAction,
    subscriptionInitialState,
  );
  const generation = useEchoGeneration(state);

  function FieldError({ field }: { field: SubscriptionField }) {
    if (state.field !== field || !state.error) return null;
    return (
      <span role="alert" className="text-xs text-destructive">
        {ts(`errors.${state.error}` as "errors.unknown")}
      </span>
    );
  }

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <label className="flex flex-col gap-1 text-sm">
        {ts("plan")}
        {/* No `required`: the browser's bubble renders in the browser's
            language, and this app is Spanish-only (§1.2). */}
        <Select
          key={generation}
          name="planId"
          defaultValue={state.values.planId ?? ""}
        >
          <option value="">{ts("planPlaceholder")}</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <FieldError field="planId" />
      </label>
      {state.error && state.field === null && (
        <p role="alert" className="text-sm text-destructive">
          {ts(`errors.${state.error}` as "errors.unknown")}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {ts("createSubmit")}
      </Button>
    </form>
  );
}

const recordPaymentInitialState: RecordPaymentFormState = {
  error: null,
  field: null,
  values: {},
};

export function RecordPaymentForm({
  tenantId,
  subscriptionId,
}: {
  tenantId: string;
  subscriptionId: string;
}) {
  const ts = useTranslations("superadmin.subscriptions");
  const [state, formAction, pending] = useActionState(
    recordPaymentAction,
    recordPaymentInitialState,
  );
  const generation = useEchoGeneration(state);

  function FieldError({ field }: { field: RecordPaymentField }) {
    if (state.field !== field || !state.error) return null;
    return (
      <span role="alert" className="text-xs text-destructive">
        {ts(`errors.${state.error}` as "errors.unknown")}
      </span>
    );
  }

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <label className="flex flex-col gap-1 text-sm">
        {ts("amount", { currency: DEFAULT_CURRENCY })}
        {/* Not type="number": it implies step="1", which blocks a decimal
            with a browser-language bubble before the app's own message can
            run. The amount is typed in major units and stored in minor units
            (plan.md §1.2) — the server does that conversion and answers. */}
        <Input
          name="amount"
          inputMode="decimal"
          defaultValue={state.values.amount ?? ""}
        />
        <FieldError field="amount" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {ts("method")}
        <Select
          key={generation}
          name="method"
          defaultValue={state.values.method ?? "transfer"}
        >
          <option value="transfer">{ts("methodValues.transfer")}</option>
          <option value="cash">{ts("methodValues.cash")}</option>
          <option value="other">{ts("methodValues.other")}</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {ts("reference")}
        <Input
          name="reference"
          defaultValue={state.values.reference ?? ""}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {ts("notes")}
        <Textarea
          name="notes"
          defaultValue={state.values.notes ?? ""}
        />
      </label>
      {state.error && state.field === null && (
        <p role="alert" className="text-sm text-destructive">
          {ts(`errors.${state.error}` as "errors.unknown")}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {ts("submit")}
      </Button>
    </form>
  );
}
