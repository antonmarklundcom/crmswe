"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createFormAction, type FormCreateField, type FormFormState } from "./actions";
import { Input, Select } from "@/components/ui/form-fields";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions.
const initialState: FormFormState = { error: null, field: null, values: {} };

type Stage = { id: string; name: string };
type TurnstileSite = { id: string; name: string };

export function FormCreateForm({
  pipelineId,
  stages,
  turnstileSites,
}: {
  pipelineId: string | null;
  stages: Stage[];
  /** Sites that have Turnstile credentials saved (PLAN.md §5.2). */
  turnstileSites: TurnstileSite[];
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
      {pipelineId && (
        <>
          <input type="hidden" name="targetPipelineId" value={pipelineId} />
          <label className="flex flex-col gap-1 text-sm">
            {t("targetStage")}
            <Select
              name="targetStageId"
              defaultValue={state.values.targetStageId ?? ""}
            >
              <option value="">{t("noStage")}</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </label>
        </>
      )}
      {turnstileSites.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          {t("turnstileSite")}
          <Select
            name="turnstileSiteId"
            defaultValue={state.values.turnstileSiteId ?? ""}
          >
            <option value="">{t("turnstileNone")}</option>
            {turnstileSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </label>
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
