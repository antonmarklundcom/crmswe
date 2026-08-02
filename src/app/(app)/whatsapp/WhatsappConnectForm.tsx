"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { connectAccountAction, type ConnectField, type ConnectFormState } from "./actions";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions.
const initialState: ConnectFormState = { error: null, field: null, values: {} };

export function WhatsappConnectForm() {
  const t = useTranslations("app.whatsapp");
  const [state, formAction, pending] = useActionState(connectAccountAction, initialState);

  function FieldError({ field }: { field: ConnectField }) {
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
        {t("wabaId")}
        <input
          name="wabaId"
          defaultValue={state.values.wabaId ?? ""}
          className="rounded-md border px-3 py-2"
        />
        <FieldError field="wabaId" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("phoneNumberId")}
        <input
          name="phoneNumberId"
          defaultValue={state.values.phoneNumberId ?? ""}
          className="rounded-md border px-3 py-2"
        />
        <FieldError field="phoneNumberId" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("displayNumber")}
        <input
          name="displayNumber"
          defaultValue={state.values.displayNumber ?? ""}
          className="rounded-md border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("accessToken")}
        {/* Not echoed back on a rejected submit — a secret is worth
            retyping, unlike the rest of the form. */}
        <input name="accessToken" type="password" className="rounded-md border px-3 py-2" />
        <FieldError field="accessToken" />
      </label>
      {state.error && state.field === null && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.unknown")}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {t("connect")}
      </Button>
    </form>
  );
}
