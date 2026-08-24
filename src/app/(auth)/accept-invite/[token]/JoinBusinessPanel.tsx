"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { joinWithExistingAccountAction, type AcceptInviteState } from "./actions";

// The second door onto an invitation (PLAN.md §3.1, reopened): the invited
// address already has an account, so there is nothing to create — they sign in
// as themselves and the invitation becomes a membership alongside the
// businesses they already work in. No name field, no password field: this flow
// must never be able to change either, or an invite link would be a password
// reset for an existing account.

const initialState: AcceptInviteState = { error: null, success: false };

export function JoinBusinessPanel({
  token,
  email,
  signedInAs,
}: {
  token: string;
  email: string;
  /** The session's email, or null when nobody is signed in. */
  signedInAs: string | null;
}) {
  const t = useTranslations("auth.acceptInvite");
  const [state, formAction, pending] = useActionState(
    joinWithExistingAccountAction,
    initialState,
  );

  if (state.success) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4">
        <p className="text-sm">{t("joined")}</p>
        <Button asChild>
          <Link href="/dashboard">{t("goToApp")}</Link>
        </Button>
      </div>
    );
  }

  const matches = signedInAs?.toLowerCase() === email.toLowerCase();

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("joinTitle")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("existingAccount", { email })}
      </p>

      {matches ? (
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <Button type="submit" disabled={pending}>
            {t("joinSubmit")}
          </Button>
        </form>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {signedInAs ? t("wrongAccount", { email }) : t("signInFirst")}
          </p>
          <Button asChild variant="outline">
            <Link href={`/login?next=/accept-invite/${token}`}>{t("signIn")}</Link>
          </Button>
        </>
      )}

      {state.error && <p className="text-sm text-destructive">{t("invalid")}</p>}
    </div>
  );
}
