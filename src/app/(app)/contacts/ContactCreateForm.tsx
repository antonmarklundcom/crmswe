"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  createContactAction,
  type ContactField,
  type ContactFormState,
} from "./actions";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions, so a shared constant there breaks the build.
const initialState: ContactFormState = {
  error: null,
  field: null,
  saved: false,
  values: {},
};

// Create-contact form (PLAN.md §10 1R #6). Same useActionState shape as the
// 1M auth forms: the action returns state instead of throwing, so a
// duplicate phone or a malformed email lands under the offending input and
// the half-filled form survives.
//
// `required`/`type="email"` are deliberately off: the browser's own bubbles
// are rendered in the *browser's* language, which would put English or
// Portuguese next to Spanish-only copy (§1.2). One validator — the server —
// means one language and one message per failure.

export function ContactCreateForm() {
  const t = useTranslations("app.contacts");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(
    createContactAction,
    initialState,
  );

  function FieldError({ field }: { field: ContactField }) {
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
        {t("phone")}
        <input
          name="phone"
          defaultValue={state.values.phone ?? ""}
          className="rounded-md border px-3 py-2"
        />
        <FieldError field="phone" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("email")}
        <input
          name="email"
          inputMode="email"
          defaultValue={state.values.email ?? ""}
          className="rounded-md border px-3 py-2"
        />
        <FieldError field="email" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("source")}
        <input
          name="source"
          defaultValue={state.values.source ?? ""}
          className="rounded-md border px-3 py-2"
        />
      </label>
      {/* Form-level slot: errors with no field to sit under (§10 1R #6). */}
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
