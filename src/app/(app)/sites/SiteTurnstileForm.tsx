"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  saveSiteTurnstileAction,
  clearSiteTurnstileAction,
  type TurnstileFormState,
} from "./actions";
import { Input } from "@/components/ui/form-fields";

// Per-site Cloudflare Turnstile (PLAN.md §5.2). A site with nothing saved
// here behaves exactly as it did before — this panel is entirely additive.
//
// The secret is write-only from the UI's side: it is encrypted at rest
// (§3.4) and never read back into the page, so the field is always blank and
// re-saving means re-pasting it. That is deliberate, same as a WhatsApp token.

const initialState: TurnstileFormState = { error: null, saved: false, values: {} };

export function SiteTurnstileForm({
  siteId,
  configured,
  siteKey,
  requireOnIngest,
}: {
  siteId: string;
  configured: boolean;
  siteKey: string | null;
  requireOnIngest: boolean;
}) {
  const t = useTranslations("app.sites.turnstile");
  const [state, formAction, pending] = useActionState(saveSiteTurnstileAction, initialState);

  return (
    <details className="rounded-md border px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none">
        {t("title")}{" "}
        <span className="text-muted-foreground">
          {configured ? t("statusOn") : t("statusOff")}
        </span>
      </summary>

      <p className="mt-2 text-muted-foreground">{t("intro")}</p>

      <form action={formAction} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="siteId" value={siteId} />
        <label className="flex flex-col gap-1">
          {t("siteKey")}
          <Input
            name="turnstileSiteKey"
            defaultValue={state.values.turnstileSiteKey ?? siteKey ?? ""}
            className="px-2 py-1 font-mono text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          {t("secret")}
          <Input
            name="turnstileSecret"
            type="password"
            autoComplete="off"
            placeholder={configured ? t("secretStored") : ""}
            className="px-2 py-1 font-mono text-xs"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="requireOnIngest"
            defaultChecked={requireOnIngest}
            className="size-4"
          />
          {t("requireOnIngest")}
        </label>
        {state.error && (
          <p role="alert" className="text-destructive">
            {t(`errors.${state.error}` as "errors.turnstileIncomplete")}
          </p>
        )}
        {state.saved && <p className="text-muted-foreground">{t("saved")}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      </form>

      {configured && (
        <form action={clearSiteTurnstileAction} className="mt-2">
          <input type="hidden" name="siteId" value={siteId} />
          <Button type="submit" size="sm" variant="ghost">
            {t("remove")}
          </Button>
        </form>
      )}
    </details>
  );
}
