"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { acceptInviteAction, type AcceptInviteState } from "./actions";

const initialState: AcceptInviteState = { error: null, success: false };

export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations("auth.acceptInvite");
  const [state, formAction, pending] = useActionState(
    acceptInviteAction,
    initialState,
  );

  if (state.success) {
    return <p className="text-sm">{t("success")}</p>;
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1 text-sm">
        {t("name")}
        <input name="name" required className="rounded-md border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("password")}
        <input
          type="password"
          name="password"
          required
          minLength={8}
          className="rounded-md border px-3 py-2"
        />
      </label>
      {state.error && <p className="text-sm text-destructive">{t("invalid")}</p>}
      <Button type="submit" disabled={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
