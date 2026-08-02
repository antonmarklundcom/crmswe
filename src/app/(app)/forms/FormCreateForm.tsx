"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createFormAction, type FormCreateField, type FormFormState } from "./actions";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions.
const initialState: FormFormState = { error: null, field: null, values: {} };

type Stage = { id: string; name: string };

export function FormCreateForm({
  pipelineId,
  stages,
}: {
  pipelineId: string | null;
  stages: Stage[];
}) {
  const t = useTranslations("app.forms");
  const [state, formAction, pending] = useActionState(createFormAction, initialState);

  function FieldError({ field }: { field: FormCreateField }) {
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
        {t("slug")}
        <input
          name="slug"
          defaultValue={state.values.slug ?? ""}
          className="rounded-md border px-3 py-2"
        />
        <FieldError field="slug" />
      </label>
      {pipelineId && (
        <>
          <input type="hidden" name="targetPipelineId" value={pipelineId} />
          <label className="flex flex-col gap-1 text-sm">
            {t("targetStage")}
            <select
              name="targetStageId"
              defaultValue={state.values.targetStageId ?? ""}
              className="rounded-md border px-3 py-2"
            >
              <option value="">{t("noStage")}</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {state.error && state.field === null && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.unknown")}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {t("createForm")}
      </Button>
    </form>
  );
}
