"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import {
  assignChatAction,
  createWidgetAction,
  replyInChatAction,
  updateWidgetAction,
  type FormState,
} from "./actions";

// Lives here, not in actions.ts: a "use server" module may only export async
// functions.
const empty: FormState = { error: null, values: {} };

// The interactive half of /chat. Copy comes from next-intl on the client, the
// shape BookingTypeForm established: the widget form reaches every configurable
// column on the row now, which is too many strings to thread through the
// server page one prop at a time.

export type WidgetValues = {
  siteId: string;
  name: string;
  mode: string;
  isActive: boolean;
  greeting: string;
  primaryColor: string;
  avatarUrl: string;
  launcherLabel: string;
  position: string;
  offlineMessage: string;
  systemPrompt: string;
  neverPromise: string;
  askForPhone: boolean;
  captureAfterMessages: number;
  businessHoursMode: string;
  createDeal: boolean;
  defaultPipelineId: string;
  defaultStageId: string;
  defaultOwnerUserId: string;
  defaultTagIds: string[];
  maxRepliesPerConversationPerDay: number | null;
  allowedOrigins: string[];
};

type Option = { id: string; name: string };

export type WidgetOptions = {
  sites: Option[];
  pipelines: Option[];
  stagesByPipeline: Record<string, Option[]>;
  users: Option[];
  tags: Option[];
  tenantOnDraft: boolean;
};

function WidgetFields({
  options,
  values,
}: {
  options: WidgetOptions;
  values?: WidgetValues;
}) {
  const t = useTranslations("app.chat");
  const [pipelineId, setPipelineId] = useState(values?.defaultPipelineId ?? "");
  const stages = options.stagesByPipeline[pipelineId] ?? [];

  return (
    <>
      <Section title={t("appearanceTitle")} help={t("appearanceHelp")}>
        <Field label={t("site")}>
          <Select name="siteId" defaultValue={values?.siteId ?? ""}>
            {options.sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("widgetName")}>
          <Input name="name" defaultValue={values?.name ?? ""} />
        </Field>
        <Field label={t("greeting")}>
          <Input name="greeting" defaultValue={values?.greeting ?? ""} />
        </Field>
        <Field label={t("color")}>
          <Input
            name="primaryColor"
            defaultValue={values?.primaryColor ?? ""}
            placeholder="#111827"
          />
        </Field>
        <Field label={t("avatarUrl")} help={t("avatarUrlHelp")} wide>
          <Input name="avatarUrl" defaultValue={values?.avatarUrl ?? ""} />
        </Field>
        <Field label={t("launcherLabel")} help={t("launcherLabelHelp")}>
          <Input name="launcherLabel" defaultValue={values?.launcherLabel ?? ""} placeholder="💬" />
        </Field>
        <Field label={t("position")}>
          <Select name="position" defaultValue={values?.position ?? "right"}>
            <option value="right">{t("positionRight")}</option>
            <option value="left">{t("positionLeft")}</option>
          </Select>
        </Field>
        {/* Pausing beats deleting: the embed snippet stays on the client's
            pages either way, and an inactive widget answers nothing instead
            of 404-ing in their footer. */}
        <Check name="isActive" defaultChecked={values?.isActive ?? true} label={t("isActive")} />
      </Section>

      <Section title={t("aiTitle")} help={t("aiHelp")}>
        <Field label={t("mode")}>
          <Select name="mode" defaultValue={values?.mode ?? "draft"}>
            <option value="off">{t("modeOff")}</option>
            <option value="draft">{t("modeDraft")}</option>
            <option value="send">{t("modeSend")}</option>
          </Select>
        </Field>
        {/* The tenant mode is a ceiling over this one, so a widget set to
            autonomous under a draft-mode tenant still drafts. Saying so here is
            the difference between a guarantee and a confusing setting. */}
        {options.tenantOnDraft ? (
          <p className="w-full text-xs text-muted-foreground">{t("modeCeiling")}</p>
        ) : null}
        <Field label={t("businessHoursMode")} help={t("businessHoursModeHelp")}>
          <Select name="businessHoursMode" defaultValue={values?.businessHoursMode ?? "always"}>
            <option value="always">{t("businessHoursAlways")}</option>
            <option value="business_hours">{t("businessHoursOnly")}</option>
          </Select>
        </Field>
        <Field label={t("offlineMessage")} help={t("offlineMessageHelp")} wide>
          <Input name="offlineMessage" defaultValue={values?.offlineMessage ?? ""} />
        </Field>
        <Field label={t("systemPrompt")} help={t("systemPromptHelp")} wide>
          <Textarea name="systemPrompt" rows={4} defaultValue={values?.systemPrompt ?? ""} />
        </Field>
        <Field label={t("neverPromise")} wide>
          <Textarea name="neverPromise" rows={2} defaultValue={values?.neverPromise ?? ""} />
        </Field>
        <Field label={t("maxPerConversation")} help={t("capsShared")}>
          <Input
            name="maxRepliesPerConversationPerDay"
            inputMode="numeric"
            defaultValue={String(values?.maxRepliesPerConversationPerDay ?? "")}
          />
        </Field>
      </Section>

      <Section title={t("captureTitle")} help={t("captureHelp")}>
        <Check
          name="askForPhone"
          defaultChecked={values?.askForPhone ?? true}
          label={t("askForPhone")}
        />
        <Field label={t("captureAfter")}>
          <Input
            name="captureAfterMessages"
            inputMode="numeric"
            defaultValue={String(values?.captureAfterMessages ?? 2)}
          />
        </Field>
        <Check
          name="createDeal"
          defaultChecked={values?.createDeal ?? false}
          label={t("createDeal")}
        />
        {/* The createDeal toggle without these was a promise with no address:
            the deal had to land on the first pipeline the query returned. */}
        <Field label={t("pipeline")}>
          <Select
            name="defaultPipelineId"
            value={pipelineId}
            onChange={(event) => setPipelineId(event.target.value)}
          >
            <option value="">{t("none")}</option>
            {options.pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("stage")}>
          {/* Keyed on the pipeline so switching board resets the stage rather
              than leaving one from the previous board selected. */}
          <Select
            key={pipelineId}
            name="defaultStageId"
            defaultValue={values?.defaultStageId ?? ""}
            disabled={!pipelineId}
          >
            <option value="">{t("none")}</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("owner")}>
          <Select name="defaultOwnerUserId" defaultValue={values?.defaultOwnerUserId ?? ""}>
            <option value="">{t("none")}</option>
            {options.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
        </Field>
        {options.tags.length > 0 ? (
          <Field label={t("tags")} wide>
            <span className="flex flex-wrap gap-3 text-sm">
              {options.tags.map((tag) => (
                <label key={tag.id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    name="defaultTagIds"
                    value={tag.id}
                    defaultChecked={(values?.defaultTagIds ?? []).includes(tag.id)}
                    className="size-4"
                  />
                  {tag.name}
                </label>
              ))}
            </span>
          </Field>
        ) : null}
      </Section>

      <Section title={t("originsTitle")} help={t("allowedOriginsHelp")}>
        <Field label={t("allowedOrigins")} wide>
          <Textarea
            name="allowedOrigins"
            rows={3}
            defaultValue={(values?.allowedOrigins ?? []).join("\n")}
          />
        </Field>
      </Section>
    </>
  );
}

export function NewWidgetForm({ options }: { options: WidgetOptions }) {
  const t = useTranslations("app.chat");
  const [state, action, pending] = useActionState<FormState, FormData>(createWidgetAction, empty);

  return (
    <form action={action} className="flex flex-col gap-6 rounded-lg border p-4">
      <WidgetFields options={options} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("createWidget")}
        </Button>
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${state.error}` as "errors.nameRequired")}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function EditWidgetForm({
  widgetId,
  options,
  values,
}: {
  widgetId: string;
  options: WidgetOptions;
  values: WidgetValues;
}) {
  const t = useTranslations("app.chat");
  const bound = updateWidgetAction.bind(null, widgetId);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, empty);

  return (
    <form action={action} className="flex flex-col gap-6">
      <WidgetFields options={options} values={values} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${state.error}` as "errors.nameRequired")}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function ChatReplyForm({
  conversationId,
  label,
  placeholder,
}: {
  conversationId: string;
  label: string;
  placeholder: string;
}) {
  const bound = replyInChatAction.bind(null, conversationId);
  const [, action, pending] = useActionState<FormState, FormData>(bound, empty);

  return (
    <form action={action} className="flex gap-2">
      <Input name="body" placeholder={placeholder} className="flex-1" />
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}

/**
 * Who owns the thread. `assignConversation` has existed since the widget
 * shipped with nothing calling it, and a hand-written reply only claims a
 * thread nobody has — this is the way to hand one over, or to take one that
 * has been sitting unanswered.
 *
 * Submits on change, keyed on the stored value, exactly as the WhatsApp
 * inbox's picker does: one field needs no save button, and remounting only
 * when the value actually changed keeps a revalidation from snapping an open
 * dropdown shut.
 */
export function AssignChatSelect({
  conversationId,
  users,
  assignedUserId,
  labels,
}: {
  conversationId: string;
  users: Option[];
  assignedUserId: string | null;
  labels: { assigned: string; unassigned: string; failed: string };
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{labels.assigned}</span>
      <Select
        key={assignedUserId ?? ""}
        defaultValue={assignedUserId ?? ""}
        disabled={pending}
        onChange={(event) => {
          const userId = event.target.value;
          startTransition(async () => {
            try {
              await assignChatAction(conversationId, userId);
            } catch {
              // The chosen user stopped being an active member between the
              // render and the click. Saying so beats a select that silently
              // snaps back.
              toast.error(labels.failed);
            }
          });
        }}
      >
        <option value="">{labels.unassigned}</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{help}</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  help,
  wide,
  children,
}: {
  label: string;
  help?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${wide ? "w-full" : ""}`}>
      {label}
      {children}
      {help ? <span className="text-xs text-muted-foreground">{help}</span> : null}
    </label>
  );
}

function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4" />
      {label}
    </label>
  );
}
