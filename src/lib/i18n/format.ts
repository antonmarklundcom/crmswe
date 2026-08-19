import { intlTag } from "./locales";

// One place where dates and numbers become strings. Before this every page
// carried its own `new Intl.*Format("es-PY", …)`, which made the locale a
// literal in 25 files and quietly meant "Paraguay" even for a Swedish user
// (PLAN.md §13 H5 #5). Timezone and currency are *not* locale-derived: they
// come from the tenant's settings, because a Swedish rep looking at a
// Paraguayan tenant's data still needs Asunción time and guaraníes.

export const DEFAULT_TIMEZONE = "America/Asuncion";

export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlTag(locale), options).format(value);
}

/** Amount + currency code, the shape the whole app shows money in: integer
 * minor units for zero-decimal PYG, so no fraction digits are invented. */
export function formatMoney(value: number, currency: string, locale: string): string {
  return `${formatNumber(value, locale)} ${currency}`;
}

export function formatDate(
  value: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" },
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  return new Intl.DateTimeFormat(intlTag(locale), { timeZone, ...options }).format(new Date(value));
}

export function formatDateTime(
  value: Date | string | number,
  locale: string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  return formatDate(
    value,
    locale,
    { dateStyle: "short", timeStyle: "short" },
    timeZone,
  );
}

export function formatTime(
  value: Date | string | number,
  locale: string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  return formatDate(value, locale, { hour: "2-digit", minute: "2-digit" }, timeZone);
}
