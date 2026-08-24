"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createTenantAction, type TenantField, type CreateTenantFormState } from "./actions";
import { Input } from "@/components/ui/form-fields";
import { slugify } from "@/lib/slug";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions.
const initialState: CreateTenantFormState = { error: null, field: null, values: {} };

export function CreateTenantForm() {
  const t = useTranslations("superadmin.tenants");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(createTenantAction, initialState);
  // The slug follows the name until somebody edits it, and then stops — the
  // one behaviour that makes an auto-filled field trustworthy rather than
  // annoying. The server derives it again when the box arrives empty.
  const [slug, setSlug] = useState(state.values.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(false);

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
          onChange={(event) => {
            if (!slugEdited) setSlug(slugify(event.target.value));
          }}
        />
        <FieldError field="name" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("slug")}
        <Input
          name="slug"
          value={slug}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
          }}
          placeholder={t("slugPlaceholder")}
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
