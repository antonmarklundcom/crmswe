import { getLocale, getTranslations } from "next-intl/server";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { Button } from "@/components/ui/button";
import { setLocaleAction } from "@/app/locale-actions";

// One switcher, used signed-in (writes users.locale) and signed-out (writes
// the cookie) — the action decides which, so the component doesn't have to
// know whether there is a session (PLAN.md §13 H5 #2).
export async function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = await getLocale();
  const t = await getTranslations("app.settings.language");

  return (
    <form action={setLocaleAction} className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm">
        {!compact && <span>{t("label")}</span>}
        <select
          name="locale"
          defaultValue={locale}
          className="rounded-md border px-2 py-1 text-sm"
          aria-label={t("label")}
        >
          {SUPPORTED_LOCALES.map((value) => (
            <option key={value} value={value}>
              {LOCALE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" variant="outline">
        {t("save")}
      </Button>
    </form>
  );
}
