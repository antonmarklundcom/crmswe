"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PAYMENT_METHODS } from "@/modules/documents/types";
import {
  recordPaymentAction,
  voidDocumentAction,
  type RecordPaymentField,
  type RecordPaymentFormState,
  type VoidDocumentFormState,
} from "../actions";
import { Input, Select } from "@/components/ui/form-fields";

// Both forms here have a real user-fillable field (amount, reason), unlike
// the hidden-id-only buttons on this page — so both get the useActionState
// treatment (PLAN.md §10 1R #6) instead of throwing into Next's error page.

const recordPaymentInitialState: RecordPaymentFormState = {
  error: null,
  field: null,
  values: {},
};

export function RecordPaymentForm({ documentId }: { documentId: string }) {
  const t = useTranslations("app.documents");
  const [state, formAction, pending] = useActionState(
    recordPaymentAction,
    recordPaymentInitialState,
  );

  function FieldError({ field }: { field: RecordPaymentField }) {
    if (state.field !== field || !state.error) return null;
    return (
      <span role="alert" className="text-xs text-destructive">
        {t(`errors.${state.error}` as "errors.unknown")}
      </span>
    );
  }

  return (
    <form
      action={formAction}
      className="flex max-w-md flex-wrap items-end gap-2 text-sm"
    >
      <input type="hidden" name="documentId" value={documentId} />
      <label className="flex flex-col gap-1">
        {t("amount")}
        <Input
          name="amount"
          inputMode="numeric"
          defaultValue={state.values.amount ?? ""}
          className="w-32 px-2 py-1"
        />
        <FieldError field="amount" />
      </label>
      <label className="flex flex-col gap-1">
        {t("method")}
        <Select
          name="method"
          defaultValue={state.values.method ?? PAYMENT_METHODS[0]}
          className="px-2 py-1"
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {t(`methodValues.${method}` as "methodValues.cash")}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        {t("reference")}
        <Input
          name="reference"
          defaultValue={state.values.reference ?? ""}
          className="px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        {t("paidAt")}
        <Input
          name="paidAt"
          type="date"
          defaultValue={state.values.paidAt ?? new Date().toISOString().slice(0, 10)}
          className="px-2 py-1"
        />
      </label>
      {state.error && state.field === null && (
        <p role="alert" className="w-full text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.unknown")}
        </p>
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {t("recordPayment")}
      </Button>
    </form>
  );
}

const voidInitialState: VoidDocumentFormState = { error: null, values: { reason: "" } };

export function VoidDocumentForm({ documentId }: { documentId: string }) {
  const t = useTranslations("app.documents");
  const [state, formAction, pending] = useActionState(voidDocumentAction, voidInitialState);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-2 text-sm">
      <p className="text-xs text-muted-foreground">{t("voidWarning")}</p>
      <input type="hidden" name="documentId" value={documentId} />
      <label className="flex flex-col gap-1">
        {t("voidReason")}
        <Input
          name="reason"
          defaultValue={state.values.reason}
        />
        {state.error && (
          <span role="alert" className="text-xs text-destructive">
            {t(`errors.${state.error}` as "errors.unknown")}
          </span>
        )}
      </label>
      <Button type="submit" variant="outline" size="sm" className="w-fit" disabled={pending}>
        {t("voidAction")}
      </Button>
    </form>
  );
}
