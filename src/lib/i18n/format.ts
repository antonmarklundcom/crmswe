import { currencyMinorUnitDigits, minorUnitsToDecimalString } from "@/lib/money";
import { intlTag } from "./locales";

// One place where dates and numbers become strings. Before this every page
// carried its own `new Intl.*Format("es-PY", …)`, which made the locale a
// literal in 25 files (docs/VENDERCRM-PLAN.md §13 H5 #5). Timezone and
// currency are *not* locale-derived: they come from the tenant's settings,
// because a user reading English still needs the tenant's own currency and
// clock.

export const DEFAULT_TIMEZONE = "Europe/Stockholm";

export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlTag(locale), options).format(value);
}

/**
 * Money as the whole app shows it. `value` is **minor units** (öre for SEK,
 * plan.md §1.2) and comes back as a properly localized currency amount:
 * `12 500,00 kr` in Swedish, with the currency's own number of decimals.
 *
 * The amount reaches Intl as an exact decimal *string*, never as
 * `value / 100`: NumberFormat accepts a string precisely so that money does
 * not have to take a trip through binary floating point on its way to a
 * screen. It is also why the currency suffix is gone — the old
 * `"1 500 000 PYG"` was a number and a code glued together, not a formatted
 * amount.
 */
export function formatMoney(value: number, currency: string, locale: string): string {
  const digits = currencyMinorUnitDigits(currency);
  const decimal = minorUnitsToDecimalString(value, digits);
  const formatter = new Intl.NumberFormat(intlTag(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  // `format` has taken a string since Intl.NumberFormat v3; the DOM typings
  // still declare only `number`.
  return formatter.format(decimal as unknown as number);
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
