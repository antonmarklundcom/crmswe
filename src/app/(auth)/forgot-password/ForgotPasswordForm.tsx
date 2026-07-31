"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

// Better Auth's own route always returns the same generic response whether
// or not the email exists (timing-attack mitigation, see password.mjs) — so
// this form shows one "listo" state regardless of outcome. There is nothing
// to branch on: a different message for "email not found" would leak which
// emails have accounts.
export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    const email = String(formData.get("email") ?? "");

    await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setPending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-3 text-center">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("sent")}</p>
        <Link href="/login" className="text-sm underline underline-offset-4">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <label className="flex flex-col gap-1 text-sm">
        {t("email")}
        <input type="email" name="email" required className="rounded-md border px-3 py-2" />
      </label>
      <Button type="submit" disabled={pending}>
        {t("submit")}
      </Button>
      <Link href="/login" className="text-center text-sm underline underline-offset-4">
        {t("backToLogin")}
      </Link>
    </form>
  );
}
