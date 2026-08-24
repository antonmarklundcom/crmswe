"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import {
  createWidgetAction,
  replyInChatAction,
  updateWidgetAction,
  type FormState,
} from "./actions";

// Lives here, not in actions.ts: a "use server" module may only export async
// functions.
const empty: FormState = { error: null, values: {} };

export type WidgetLabels = {
  site: string;
  name: string;
  greeting: string;
  color: string;
  systemPrompt: string;
  systemPromptHelp: string;
  neverPromise: string;
  mode: string;
  modeOff: string;
  modeDraft: string;
  modeSend: string;
  modeCeiling: string;
  askForPhone: string;
  captureAfter: string;
  createDeal: string;
  allowedOrigins: string;
  allowedOriginsHelp: string;
  maxPerConversation: string;
  capsShared: string;
  save: string;
  create: string;
  errors: Record<string, string>;
};

type WidgetValues = {
  siteId: string;
  name: string;
  mode: string;
  greeting: string;
  primaryColor: string;
  systemPrompt: string;
  neverPromise: string;
  askForPhone: boolean;
  captureAfterMessages: number;
  createDeal: boolean;
  maxRepliesPerConversationPerDay: number | null;
  allowedOrigins: string[];
};

function WidgetFields({
  labels,
  sites,
  values,
  tenantOnDraft,
}: {
  labels: WidgetLabels;
  sites: Array<{ id: string; name: string }>;
  values?: WidgetValues;
  tenantOnDraft: boolean;
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        {labels.site}
        <Select name="siteId" defaultValue={values?.siteId ?? ""}>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {labels.name}
        <Input name="name" defaultValue={values?.name ?? ""} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {labels.greeting}
        <Input name="greeting" defaultValue={values?.greeting ?? ""} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {labels.color}
        <Input name="primaryColor" defaultValue={values?.primaryColor ?? ""} placeholder="#111827" />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {labels.mode}
        <Select name="mode" defaultValue={values?.mode ?? "draft"}>
          <option value="off">{labels.modeOff}</option>
          <option value="draft">{labels.modeDraft}</option>
          <option value="send">{labels.modeSend}</option>
        </Select>
      </label>
      {/* The tenant mode is a ceiling over this one, so a widget set to
          autonomous under a draft-mode tenant still drafts. Saying so here is
          the difference between a guarantee and a confusing setting. */}
      {tenantOnDraft ? (
        <p className="text-xs text-muted-foreground">{labels.modeCeiling}</p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        {labels.systemPrompt}
        <Textarea name="systemPrompt" rows={4} defaultValue={values?.systemPrompt ?? ""} />
        <span className="text-xs text-muted-foreground">{labels.systemPromptHelp}</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {labels.neverPromise}
        <Textarea name="neverPromise" rows={2} defaultValue={values?.neverPromise ?? ""} />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="askForPhone" defaultChecked={values?.askForPhone ?? true} />
        {labels.askForPhone}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {labels.captureAfter}
        <Input
          type="number"
          name="captureAfterMessages"
          defaultValue={String(values?.captureAfterMessages ?? 2)}
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="createDeal" defaultChecked={values?.createDeal ?? false} />
        {labels.createDeal}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {labels.maxPerConversation}
        <Input
          type="number"
          name="maxRepliesPerConversationPerDay"
          defaultValue={String(values?.maxRepliesPerConversationPerDay ?? "")}
        />
        <span className="text-xs text-muted-foreground">{labels.capsShared}</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {labels.allowedOrigins}
        <Textarea
          name="allowedOrigins"
          rows={3}
          defaultValue={(values?.allowedOrigins ?? []).join("\n")}
        />
        <span className="text-xs text-muted-foreground">{labels.allowedOriginsHelp}</span>
      </label>
    </>
  );
}

export function NewWidgetForm({
  labels,
  sites,
  tenantOnDraft,
}: {
  labels: WidgetLabels;
  sites: Array<{ id: string; name: string }>;
  tenantOnDraft: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createWidgetAction, empty);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <WidgetFields labels={labels} sites={sites} tenantOnDraft={tenantOnDraft} />
      <Button type="submit" disabled={pending}>
        {labels.create}
      </Button>
      {state.error ? <p className="text-sm text-destructive">{labels.errors[state.error]}</p> : null}
    </form>
  );
}

export function EditWidgetForm({
  widgetId,
  labels,
  sites,
  values,
  tenantOnDraft,
}: {
  widgetId: string;
  labels: WidgetLabels;
  sites: Array<{ id: string; name: string }>;
  values: WidgetValues;
  tenantOnDraft: boolean;
}) {
  const bound = updateWidgetAction.bind(null, widgetId);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, empty);

  return (
    <form action={action} className="flex flex-col gap-3">
      <WidgetFields
        labels={labels}
        sites={sites}
        values={values}
        tenantOnDraft={tenantOnDraft}
      />
      <Button type="submit" disabled={pending}>
        {labels.save}
      </Button>
      {state.error ? <p className="text-sm text-destructive">{labels.errors[state.error]}</p> : null}
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
