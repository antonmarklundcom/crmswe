"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  createSubscriptionAction,
  recordPaymentAction,
  type RecordPaymentField,
  type RecordPaymentFormState,
  type SubscriptionField,
  type SubscriptionFormState,
} from "./actions";

// Both forms here have a real user-fillable field (the plan picker, the
// amount), so both get the useActionState treatment from PLAN.md §10 1R #6
// instead of throwing into Next's error page. Initial state lives here, not
// in actions.ts: a "use server" module may only export async functions.

// The echo does not take on a `<select>` the way it does on a `defaultValue`
// input, and the reason is worth writing down because the obvious fixes
// don't work:
//
//   * Plain `defaultValue` fails. React applies it by marking the matching
//     option selected at *mount* and never re-applies it, so a rejected
//     submit hands back a select still showing the old option.
//   * Making it controlled fails too, and fails more confusingly. React
//     resets the form once the action resolves, and `form.reset()` restores
//     each option's `selected` *attribute* — which a controlled select never
//     sets, since React only assigns the value property. The reset therefore
//     lands on option 0 while React still believes the state is correct, so
//     nothing re-syncs it. Verified in the browser, not reasoned about.
//
// What works is remounting on each new action state with the echoed value as
// the `defaultValue`: a fresh mount does set the `selected` attribute, so the
// reset that follows restores the echoed option instead of the first one.
// Between submits the select is ordinary and uncontrolled.
function useEchoGeneration<S>(state: S): number {
  const [seenState, setSeenState] = useState(state);
  const [generation, setGeneration] = useState(0);
  // A render-phase adjustment rather than an effect, so the select never
  // paints the wrong option for a frame first.
  if (seenState !== state) {
    setSeenState(state);
    setGeneration((g) => g + 1);
  }
  return generation;
}

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
        <select
          key={generation}
          name="planId"
          defaultValue={state.values.planId ?? ""}
          className="rounded-md border px-3 py-2"
        >
          <option value="">{ts("planPlaceholder")}</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
        {ts("amount")}
        {/* Not type="number": it implies step="1", which blocks a decimal
            with a browser-language bubble before the Spanish message can
            run. Amounts are integer minor units (§2.3) — the server says so
            in Spanish. */}
        <input
          name="amount"
          inputMode="numeric"
          defaultValue={state.values.amount ?? ""}
          className="rounded-md border px-3 py-2"
        />
        <FieldError field="amount" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {ts("method")}
        <select
          key={generation}
          name="method"
          defaultValue={state.values.method ?? "transfer"}
          className="rounded-md border px-3 py-2"
        >
          <option value="transfer">{ts("methodValues.transfer")}</option>
          <option value="cash">{ts("methodValues.cash")}</option>
          <option value="other">{ts("methodValues.other")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {ts("reference")}
        <input
          name="reference"
          defaultValue={state.values.reference ?? ""}
          className="rounded-md border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {ts("notes")}
        <textarea
          name="notes"
          defaultValue={state.values.notes ?? ""}
          className="rounded-md border px-3 py-2"
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
