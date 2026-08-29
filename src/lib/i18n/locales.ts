// Supported UI languages (docs/VENDERCRM-PLAN.md §13 H5). `sv` is the default
// and the reference locale for this edition (plan.md §1.11): every key exists
// in sv.json first, and the other files are checked against it by
// messages.test.ts. `es` and `en` are kept because the parity test keeps them
// honest and they cost nothing. There is no [locale] URL segment — the
// language is a property of the *user*, not of the page, so the same URL is
// shareable between a Swedish and an English-reading colleague.

export const SUPPORTED_LOCALES = ["sv", "en", "es"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "sv";

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
  sv: "Svenska",
  en: "English",
  es: "Español",
};

/**
 * BCP-47 tag for `Intl.*`. `sv-SE` is what decides the space thousands
 * separator, the comma decimal and the ISO date order this product is written
 * around (plan.md §1.2); Spanish keeps its Paraguayan region so inherited data
 * still reads the way it always did.
 */
const INTL_TAGS: Record<SupportedLocale, string> = {
  sv: "sv-SE",
  en: "en-US",
  es: "es-PY",
};

export function intlTag(locale: string): string {
  return INTL_TAGS[toSupportedLocale(locale)];
}
