"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContext } from "@/modules/tenancy/context";
import { setUserLocale } from "@/modules/tenancy/users";
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from "@/lib/i18n/locales";

const localeSchema = z.object({ locale: z.enum(SUPPORTED_LOCALES) });

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persists a language choice. Signed in it goes on the user row, so the
 * choice follows them to any browser; signed out (login page) it can only be
 * a cookie, which then seeds the user row's default on their first visit.
 */
export async function setLocaleAction(formData: FormData) {
  const parsed = localeSchema.safeParse({ locale: formData.get("locale") });
  if (!parsed.success) return;

  const ctx = await getTenantContext();
  if (ctx) await setUserLocale(ctx.userId, parsed.data.locale);

  (await cookies()).set(LOCALE_COOKIE, parsed.data.locale, {
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/", "layout");
}
