import { createTranslator } from "next-intl";
import { toSupportedLocale, type SupportedLocale } from "./locales";

// Translations for code that is *not* rendering for the signed-in viewer:
// customer-facing artifacts (public quote/document/form pages, PDFs) and
// transactional emails. Those follow the **tenant's** locale, not the
// viewer's — a Paraguayan tenant's customer must not receive a Swedish PDF
// because a Swedish colleague clicked send (PLAN.md §13 H5 #4).
//
// Static loaders rather than a templated dynamic import so every locale is a
// real module reference the bundler can see — this runs in route handlers,
// server actions and the worker alike.
const LOADERS: Record<SupportedLocale, () => Promise<{ default: Record<string, unknown> }>> = {
  es: () => import("../../../messages/es.json"),
  en: () => import("../../../messages/en.json"),
  sv: () => import("../../../messages/sv.json"),
};

/** Deliberately loose: these call sites resolve keys the type system can't
 * follow anyway (a health reason code, a status name), and the key sets are
 * guarded by messages.test.ts instead. */
export type Translator = ((key: string, values?: Record<string, string | number>) => string) & {
  has: (key: string) => boolean;
};

export async function getTranslator(
  locale: string | null | undefined,
  namespace: string,
): Promise<Translator> {
  const resolved = toSupportedLocale(locale);
  const messages = (await LOADERS[resolved]()).default;
  return createTranslator({ locale: resolved, messages, namespace }) as unknown as Translator;
}
