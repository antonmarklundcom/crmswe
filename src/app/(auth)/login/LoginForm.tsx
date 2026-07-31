"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

// Client component: hits /api/auth/sign-in/email directly, no server action
// (the module rule §2.2 applies to business logic, not to a thin wrapper
// around Better Auth's own client). On success, redirect handles routing
// tenant users vs. superadmins to the right area (both land on "/", which
// the (app)/(superadmin) layouts route from based on the session).
export function LoginForm() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    setPending(false);

    if (signInError) {
      setError(t("error"));
      return;
    }

    router.push(searchParams.get("next") ?? "/");
    router.refresh();
  }

  return (
    <form action={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <label className="flex flex-col gap-1 text-sm">
        {t("email")}
        <input
          type="email"
          name="email"
          required
          className="rounded-md border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("password")}
        <input
          type="password"
          name="password"
          required
          className="rounded-md border px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {t("submit")}
      </Button>
      <Link href="/forgot-password" className="text-center text-sm underline underline-offset-4">
        {t("forgotPassword")}
      </Link>
    </form>
  );
}
