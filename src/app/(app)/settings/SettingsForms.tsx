"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { BusinessHours } from "@/modules/tenancy/settings";
import {
  updateAiSettingsAction,
  updateBrandingAction,
  updateBusinessHoursAction,
  updateDefaultCountryAction,
  updateReviewLinkAction,
  updateTimezoneAction,
  type SettingsFormState,
} from "./actions";

// Every settings form here shares the useActionState shape (PLAN.md §10 1R
// #6): declared client-side because a "use server" module may only export
// async functions.
const initialState: SettingsFormState = { error: null, saved: false, values: {} };

function ErrorOrSaved({
  state,
  tc,
  t,
}: {
  state: SettingsFormState;
  tc: ReturnType<typeof useTranslations<"common">>;
  t: ReturnType<typeof useTranslations<"app.settings">>;
}) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t(`errors.${state.error}` as "errors.unknown")}
      </p>
    );
  }
  if (state.saved) {
    return <p role="status" className="text-sm text-muted-foreground">{tc("saved")}</p>;
  }
  return null;
}

export function BrandingForm({
  logoUrl,
  primaryColor,
}: {
  logoUrl: string;
  primaryColor: string;
}) {
  const t = useTranslations("app.settings");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(updateBrandingAction, initialState);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        {t("logoUrl")}
        {/* Not type="url": the browser's own bubble in its own language
            would beat the server's Spanish message (§1.2, §10 1R #6). */}
        <input
          name="logoUrl"
          defaultValue={state.values.logoUrl ?? logoUrl}
          className="rounded-md border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("primaryColor")}
        <input
          name="primaryColor"
          type="color"
          defaultValue={state.values.primaryColor ?? primaryColor}
          className="h-10 w-20 rounded-md border"
        />
      </label>
      <ErrorOrSaved state={state} tc={tc} t={t} />
      <Button type="submit" disabled={pending}>
        {tc("save")}
      </Button>
    </form>
  );
}

export function TimezoneForm({ timezone }: { timezone: string }) {
  const t = useTranslations("app.settings");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(updateTimezoneAction, initialState);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-2">
      <div className="flex gap-2">
        <input
          name="timezone"
          defaultValue={state.values.timezone ?? timezone}
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {tc("save")}
        </Button>
      </div>
      <ErrorOrSaved state={state} tc={tc} t={t} />
    </form>
  );
}

export function DefaultCountryForm({
  defaultCountry,
  countryCodes,
}: {
  defaultCountry: string;
  countryCodes: readonly string[];
}) {
  const t = useTranslations("app.settings");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(updateDefaultCountryAction, initialState);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-2">
      <div className="flex gap-2">
        <select
          name="defaultCountry"
          defaultValue={state.values.defaultCountry ?? defaultCountry}
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        >
          {countryCodes.map((code) => (
            <option key={code} value={code}>
              {t(`countryNames.${code}` as "countryNames.PY")}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" disabled={pending}>
          {tc("save")}
        </Button>
      </div>
      <ErrorOrSaved state={state} tc={tc} t={t} />
    </form>
  );
}

export function ReviewLinkForm({ reviewLink }: { reviewLink: string }) {
  const t = useTranslations("app.settings");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(updateReviewLinkAction, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-2">
      <div className="flex gap-2">
        {/* Not type="url": same reason as the logo field — the browser's
            own validation bubble would beat the server's Spanish message. */}
        <input
          name="reviewLink"
          defaultValue={state.values.reviewLink ?? reviewLink}
          placeholder="https://g.page/r/.../review"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {tc("save")}
        </Button>
      </div>
      <ErrorOrSaved state={state} tc={tc} t={t} />
    </form>
  );
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function BusinessHoursForm({ businessHours }: { businessHours: BusinessHours }) {
  const t = useTranslations("app.settings");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(updateBusinessHoursAction, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-3">
      {DAYS.map((day) => (
        <div key={day} className="flex items-center gap-3 text-sm">
          <label className="flex w-32 items-center gap-2">
            <input
              type="checkbox"
              name={`${day}_enabled`}
              defaultChecked={!!businessHours[day]}
            />
            {t(`days.${day}` as "days.mon")}
          </label>
          <input
            type="time"
            name={`${day}_start`}
            defaultValue={businessHours[day]?.start ?? "08:00"}
            className="rounded-md border px-2 py-1"
          />
          <span>—</span>
          <input
            type="time"
            name={`${day}_end`}
            defaultValue={businessHours[day]?.end ?? "18:00"}
            className="rounded-md border px-2 py-1"
          />
        </div>
      ))}
      <ErrorOrSaved state={state} tc={tc} t={t} />
      <Button type="submit" className="mt-2 w-fit" disabled={pending}>
        {tc("save")}
      </Button>
    </form>
  );
}

export function AiSettingsForm({
  enabled,
  mode,
  businessName,
  businessNamePlaceholder,
  about,
  tone,
  hours,
  neverPromise,
  maxRepliesPerConversationPerDay,
  maxRepliesPerTenantPerDay,
  handoffKeyword,
}: {
  enabled: boolean;
  mode: string;
  businessName: string;
  businessNamePlaceholder: string;
  about: string;
  tone: string;
  hours: string;
  neverPromise: string;
  maxRepliesPerConversationPerDay: number;
  maxRepliesPerTenantPerDay: number;
  handoffKeyword: string;
}) {
  const t = useTranslations("app.settings");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(updateAiSettingsAction, initialState);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} />
        {t("aiEnabled")}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("aiMode")}
        <select
          name="mode"
          defaultValue={state.values.mode ?? mode}
          className="max-w-xs rounded-md border px-3 py-2"
        >
          <option value="draft">{t("aiModeDraft")}</option>
          <option value="send">{t("aiModeSend")}</option>
        </select>
        <span className="text-xs text-muted-foreground">{t("aiModeHelp")}</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("aiBusinessName")}
        <input
          name="businessName"
          defaultValue={state.values.businessName ?? businessName}
          placeholder={businessNamePlaceholder}
          className="rounded-md border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("aiAbout")}
        <textarea
          name="about"
          rows={3}
          defaultValue={state.values.about ?? about}
          placeholder={t("aiAboutPlaceholder")}
          className="rounded-md border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("aiTone")}
        <input
          name="tone"
          defaultValue={state.values.tone ?? tone}
          placeholder={t("aiTonePlaceholder")}
          className="rounded-md border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("aiHours")}
        <input
          name="hours"
          defaultValue={state.values.hours ?? hours}
          className="rounded-md border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("aiNeverPromise")}
        <textarea
          name="neverPromise"
          rows={2}
          defaultValue={state.values.neverPromise ?? neverPromise}
          placeholder={t("aiNeverPromisePlaceholder")}
          className="rounded-md border px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t("aiMaxPerConversation")}
          {/* inputMode, not type="number": server validates the ceiling
              (§10 1R #6), a browser bubble in the wrong language shouldn't
              beat it there. */}
          <input
            inputMode="numeric"
            name="maxRepliesPerConversationPerDay"
            defaultValue={
              state.values.maxRepliesPerConversationPerDay ?? String(maxRepliesPerConversationPerDay)
            }
            className="w-28 rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("aiMaxPerTenant")}
          <input
            inputMode="numeric"
            name="maxRepliesPerTenantPerDay"
            defaultValue={state.values.maxRepliesPerTenantPerDay ?? String(maxRepliesPerTenantPerDay)}
            className="w-28 rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("aiHandoffKeyword")}
          <input
            name="handoffKeyword"
            defaultValue={state.values.handoffKeyword ?? handoffKeyword}
            className="w-40 rounded-md border px-3 py-2"
          />
        </label>
      </div>

      <ErrorOrSaved state={state} tc={tc} t={t} />

      <Button type="submit" className="w-fit" disabled={pending}>
        {tc("save")}
      </Button>
    </form>
  );
}
