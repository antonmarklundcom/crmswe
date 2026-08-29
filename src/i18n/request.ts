import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { auth } from "@/lib/auth/server";
import { getTenant } from "@/modules/tenancy/tenants";
import { getUserById } from "@/modules/tenancy/users";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  toSupportedLocale,
  type SupportedLocale,
} from "@/lib/i18n/locales";

// `sv` is the default and reference locale (plan.md §1.11). English and
// Spanish are a *user* preference (§13 H5): the locale lives on the users
// row, not in the URL, so links stay shareable across a mixed-language team
// and nothing about the routing changes.
//
// Resolution order, most specific first:
//   1. the signed-in user's own choice (`users.locale`)
//   2. their tenant's locale — the sensible default for a new colleague
//   3. the cookie the switcher writes before sign-in (login, public pages)
//   4. `sv`
async function resolveLocale(): Promise<SupportedLocale> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (userId) {
      const user = await getUserById(userId);
      if (user?.locale) return toSupportedLocale(user.locale);

      if (user?.tenantId) {
        const tenant = await getTenant(user.tenantId);
        if (tenant?.locale) return toSupportedLocale(tenant.locale);
      }
    }
  } catch {
    // A locale is never worth failing a render over: an unreachable database
    // or a request phase where the session can't be read falls through to
    // the cookie and then to Spanish.
  }

  return toSupportedLocale(cookieLocale, DEFAULT_LOCALE);
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
