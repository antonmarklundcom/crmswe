// Supported UI languages (PLAN.md §13 H5). `es` stays the default and the
// reference locale (§1.2): every key exists in es.json first, and the other
// files are checked against it by messages.test.ts. There is no [locale]
// URL segment — the language is a property of the *user*, not of the page,
// so the same URL is shareable between a Spanish and a Swedish colleague.

export const SUPPORTED_LOCALES = ["es", "en", "sv"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "es";

/** Cookie carrying the choice made before there is a user row to store it on
 * (the login and public pages). Once signed in, `users.locale` wins. */
export const LOCALE_COOKIE = "vc_locale";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function toSupportedLocale(value: unknown, fallback: SupportedLocale = DEFAULT_LOCALE) {
  return isSupportedLocale(value) ? value : fallback;
}

/** Language name in its own language — a switcher that says "Spanish" to
 * someone who only reads Spanish is not a switcher. */
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  es: "Español",
  en: "English",
  sv: "Svenska",
};

/**
 * BCP-47 tag for `Intl.*`. Spanish keeps its Paraguayan region — that is
 * what decides thousands separators on guaraní amounts and the day-first
 * date order the whole product is written around; the other two get their
 * conventional regional defaults.
 */
const INTL_TAGS: Record<SupportedLocale, string> = {
  es: "es-PY",
  en: "en-US",
  sv: "sv-SE",
};

export function intlTag(locale: string): string {
  return INTL_TAGS[toSupportedLocale(locale)];
}
