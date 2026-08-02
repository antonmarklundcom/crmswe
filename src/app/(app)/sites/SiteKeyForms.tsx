"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  createSiteAction,
  rotateApiKeyAction,
  type CreateSiteFormState,
  type SiteField,
} from "./actions";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions.
const createInitialState: CreateSiteFormState = {
  error: null,
  field: null,
  values: {},
  apiKey: null,
};

// The API key is returned by the action and rendered here once. It is never
// stored in plaintext (§5.1) — reloading the page loses it, which is the
// intended behaviour, so the copy prompt is deliberately loud.

function KeyReveal({ apiKey, labels }: { apiKey: string; labels: KeyLabels }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">{labels.copyNow}</p>
      <code className="mt-2 block break-all rounded bg-white px-2 py-1 font-mono text-xs">
        {apiKey}
      </code>
    </div>
  );
}

export type KeyLabels = {
  copyNow: string;
  name: string;
  slug: string;
  domain: string;
  pipeline: string;
  stage: string;
  waAccount: string;
  none: string;
  create: string;
  rotate: string;
};

type Option = { id: string; label: string };

export function NewSiteForm({
  labels,
  pipelines,
  stages,
  waAccounts,
}: {
  labels: KeyLabels;
  pipelines: Option[];
  stages: Option[];
  waAccounts: Option[];
}) {
  const t = useTranslations("app.sites");
  const [state, formAction, pending] = useActionState(createSiteAction, createInitialState);

  function FieldError({ field }: { field: SiteField }) {
    if (state.field !== field || !state.error) return null;
    return (
      <span role="alert" className="text-xs text-destructive">
        {t(`errors.${state.error}` as "errors.unknown")}
      </span>
    );
  }

  return (
    <div className="flex max-w-sm flex-col gap-4">
      {state.apiKey && <KeyReveal apiKey={state.apiKey} labels={labels} />}
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {labels.name}
          <input
            name="name"
            defaultValue={state.values.name ?? ""}
            className="rounded-md border px-3 py-2"
          />
          <FieldError field="name" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.slug}
          <input
            name="slug"
            defaultValue={state.values.slug ?? ""}
            className="rounded-md border px-3 py-2"
          />
          <FieldError field="slug" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.domain}
          <input
            name="domain"
            defaultValue={state.values.domain ?? ""}
            placeholder="dentista.com.py"
            className="rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.pipeline}
          <select name="defaultPipelineId" className="rounded-md border px-3 py-2">
            <option value="">{labels.none}</option>
            {pipelines.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.stage}
          <select name="defaultStageId" className="rounded-md border px-3 py-2">
            <option value="">{labels.none}</option>
            {stages.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.waAccount}
          <select name="waAccountId" className="rounded-md border px-3 py-2">
            <option value="">{labels.none}</option>
            {waAccounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
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
          {labels.create}
        </Button>
      </form>
    </div>
  );
}

export function RotateKeyButton({ siteId, labels }: { siteId: string; labels: KeyLabels }) {
  const [apiKey, formAction] = useActionState(rotateApiKeyAction, null);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <input type="hidden" name="siteId" value={siteId} />
        <Button type="submit" size="sm" variant="outline">
          {labels.rotate}
        </Button>
      </form>
      {apiKey && <KeyReveal apiKey={apiKey} labels={labels} />}
    </div>
  );
}
