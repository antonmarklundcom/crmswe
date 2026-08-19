"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createTenantAction, type TenantField, type CreateTenantFormState } from "./actions";
import { Input } from "@/components/ui/form-fields";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions.
const initialState: CreateTenantFormState = { error: null, field: null, values: {} };

export function CreateTenantForm() {
  const t = useTranslations("superadmin.tenants");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(createTenantAction, initialState);

  function FieldError({ field }: { field: TenantField }) {
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
        {t("slug")}
        <Input
          name="slug"
          defaultValue={state.values.slug ?? ""}
        />
        <FieldError field="slug" />
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
