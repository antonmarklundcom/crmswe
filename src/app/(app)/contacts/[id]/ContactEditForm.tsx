"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { type ContactField, type ContactFormState } from "../actions";

// Same reason as the create form: "use server" modules export only async
// functions, so the initial state is declared client-side.
const initialState: ContactFormState = {
  error: null,
  field: null,
  saved: false,
  values: {},
};

// Edit half of the contact form pass (PLAN.md §10 1R #6). The action comes
// in already bound to the contact id — same prop shape as ConversationThread
// — so this component stays a plain useActionState consumer.

export function ContactEditForm({
  action,
  defaults,
}: {
  action: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  defaults: { name: string; email: string; notes: string };
}) {
  const t = useTranslations("app.contacts");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(action, initialState);

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
          defaultValue={state.values.name ?? defaults.name}
          className="rounded-md border px-3 py-2"
        />
        <FieldError field="name" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("email")}
        <input
          name="email"
          inputMode="email"
          defaultValue={state.values.email ?? defaults.email}
          className="rounded-md border px-3 py-2"
        />
        <FieldError field="email" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("notes")}
        <textarea
          name="notes"
          defaultValue={state.values.notes ?? defaults.notes}
          className="rounded-md border px-3 py-2"
        />
        <FieldError field="notes" />
      </label>
      {state.error && state.field === null && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.unknown")}
        </p>
      )}
      {/* Editing revalidates in place, so without this the page looks
          identical after a save and the rep can't tell it landed. */}
      {state.saved && !state.error && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("saved")}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {tc("save")}
      </Button>
    </form>
  );
}
