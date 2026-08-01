import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import type { BusinessHours, TenantSettings } from "@/modules/tenancy/settings";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { contactsFeedUrl } from "@/modules/crm/feed-url";
import { isAiConfigured } from "@/lib/ai";
import { resolveAiConfig } from "@/modules/ai/config";
import { monthlyTokenUsage } from "@/modules/ai/replies";
import { COUNTRY_CODES, DEFAULT_COUNTRY } from "@/lib/phone";
import { SheetsFeed, type SheetsLabels } from "./SheetsFeed";
import {
  updateBrandingAction,
  updateBusinessHoursAction,
  updateTimezoneAction,
  updateDefaultCountryAction,
  updateAiSettingsAction,
} from "./actions";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export default async function SettingsPage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.settings");
  const tc = await getTranslations("common");

  if (ctx.role !== "admin") {
    return <p className="text-muted-foreground">{t("adminOnly")}</p>;
  }

  const tenant = await getTenant(ctx.tenantId);
  const settings = (tenant?.settings ?? {}) as TenantSettings;
  const businessHours: BusinessHours =
    settings.businessHours ?? {
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: null,
    };

  const ai = resolveAiConfig(tenant?.name ?? "", settings.ai);
  const aiUsage = await monthlyTokenUsage(ctx);
  const aiDriverConfigured = isAiConfigured();

  const sheetsLabels: SheetsLabels = {
    formulaLabel: t("sheetsFormula"),
    copy: t("sheetsCopy"),
    copied: t("sheetsCopied"),
    generate: t("sheetsGenerate"),
    regenerate: t("sheetsRegenerate"),
    regenerateWarning: t("sheetsRegenerateWarning"),
    steps: (["generate", "paste", "refresh"] as const).map((key) =>
      t(`sheetsSteps.${key}`),
    ),
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("intro")} />

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("brandingTitle")}</h2>
        <form action={updateBrandingAction} className="flex max-w-sm flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("logoUrl")}
            <input
              name="logoUrl"
              type="url"
              defaultValue={settings.branding?.logoUrl ?? ""}
              className="rounded-md border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("primaryColor")}
            <input
              name="primaryColor"
              type="color"
              defaultValue={settings.branding?.primaryColor ?? "#000000"}
              className="h-10 w-20 rounded-md border"
            />
          </label>
          <Button type="submit">{tc("save")}</Button>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("timezoneTitle")}</h2>
        <form action={updateTimezoneAction} className="flex max-w-sm gap-2">
          <input
            name="timezone"
            defaultValue={tenant?.timezone ?? "America/Asuncion"}
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <Button type="submit" variant="outline">
            {tc("save")}
          </Button>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("defaultCountryTitle")}</h2>
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          {t("defaultCountryIntro")}
        </p>
        <form action={updateDefaultCountryAction} className="flex max-w-sm gap-2">
          <select
            name="defaultCountry"
            defaultValue={settings.defaultCountry ?? DEFAULT_COUNTRY}
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          >
            {COUNTRY_CODES.map((code) => (
              <option key={code} value={code}>
                {t(`countryNames.${code}` as "countryNames.PY")}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            {tc("save")}
          </Button>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("businessHoursTitle")}</h2>
        <form action={updateBusinessHoursAction} className="flex max-w-md flex-col gap-3">
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
          <Button type="submit" className="mt-2 w-fit">
            {tc("save")}
          </Button>
        </form>
      </section>

      {/* AI auto-reply (PLAN.md §10 1O). The two switches that carry real
          risk — "activar" and "borrador vs. envío automático" — sit at the
          top of the form, above the free-text context that shapes what the
          model says. */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">{t("aiTitle")}</h2>
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{t("aiIntro")}</p>

        {!aiDriverConfigured && (
          <p className="mb-4 max-w-2xl rounded-md border bg-amber-100 px-3 py-2 text-sm text-amber-900">
            {t("aiNotConfigured")}
          </p>
        )}

        <form action={updateAiSettingsAction} className="flex max-w-2xl flex-col gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={ai.enabled} />
            {t("aiEnabled")}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("aiMode")}
            <select
              name="mode"
              defaultValue={ai.mode}
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
              defaultValue={settings.ai?.businessName ?? ""}
              placeholder={tenant?.name ?? ""}
              className="rounded-md border px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("aiAbout")}
            <textarea
              name="about"
              rows={3}
              defaultValue={settings.ai?.about ?? ""}
              placeholder={t("aiAboutPlaceholder")}
              className="rounded-md border px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("aiTone")}
            <input
              name="tone"
              defaultValue={settings.ai?.tone ?? ""}
              placeholder={t("aiTonePlaceholder")}
              className="rounded-md border px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("aiHours")}
            <input
              name="hours"
              defaultValue={settings.ai?.hours ?? ""}
              className="rounded-md border px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t("aiNeverPromise")}
            <textarea
              name="neverPromise"
              rows={2}
              defaultValue={settings.ai?.neverPromise ?? ""}
              placeholder={t("aiNeverPromisePlaceholder")}
              className="rounded-md border px-3 py-2"
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("aiMaxPerConversation")}
              <input
                type="number"
                name="maxRepliesPerConversationPerDay"
                min={0}
                max={20}
                defaultValue={ai.maxRepliesPerConversationPerDay}
                className="w-28 rounded-md border px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("aiMaxPerTenant")}
              <input
                type="number"
                name="maxRepliesPerTenantPerDay"
                min={0}
                max={2000}
                defaultValue={ai.maxRepliesPerTenantPerDay}
                className="w-28 rounded-md border px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("aiHandoffKeyword")}
              <input
                name="handoffKeyword"
                defaultValue={ai.handoffKeyword}
                className="w-40 rounded-md border px-3 py-2"
              />
            </label>
          </div>

          <Button type="submit" className="w-fit">
            {tc("save")}
          </Button>
        </form>

        <div className="mt-6 max-w-2xl rounded-md border p-3 text-sm">
          <h3 className="mb-1 font-medium">{t("aiUsageTitle")}</h3>
          <p className="text-muted-foreground">
            {t("aiUsageBody", {
              replies: aiUsage.replies,
              prompt: aiUsage.promptTokens,
              completion: aiUsage.completionTokens,
              total: aiUsage.promptTokens + aiUsage.completionTokens,
            })}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t("sheetsTitle")}</h2>
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{t("sheetsIntro")}</p>
        <SheetsFeed
          currentUrl={
            settings.exports?.contactsToken
              ? contactsFeedUrl(settings.exports.contactsToken)
              : null
          }
          labels={sheetsLabels}
        />
      </section>
    </div>
  );
}
