"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { connectAccountAction, type ConnectField, type ConnectFormState } from "./actions";
import { Input } from "@/components/ui/form-fields";

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
        <Input
          name="wabaId"
          defaultValue={state.values.wabaId ?? ""}
        />
        <FieldError field="wabaId" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("phoneNumberId")}
        <Input
          name="phoneNumberId"
          defaultValue={state.values.phoneNumberId ?? ""}
        />
        <FieldError field="phoneNumberId" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("displayNumber")}
        <Input
          name="displayNumber"
          defaultValue={state.values.displayNumber ?? ""}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("accessToken")}
        {/* Not echoed back on a rejected submit — a secret is worth
            retyping, unlike the rest of the form. */}
        <Input name="accessToken" type="password" />
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
