import { getRequestConfig } from "next-intl/server";

// Spanish-only in Phase 1 (PLAN.md §1.2), but routed through next-intl so the
// UI never hardcodes strings — adding a locale later is a messages file, not
// a rewrite.
const locale = "es" as const;

export default getRequestConfig(async () => ({
  locale,
  messages: (await import(`../../messages/${locale}.json`)).default,
}));
