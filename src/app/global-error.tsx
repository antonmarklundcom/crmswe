"use client";

import { NextIntlClientProvider, useTranslations } from "next-intl";
import messages from "../../messages/es.json";

// Last-resort boundary: it replaces the root layout, so nothing from the
// server — including the next-intl provider mounted in layout.tsx — is
// available here. The copy still comes from the messages file rather than
// from literals in this file; only the `errors` subtree is handed to the
// provider so the fallback stays a self-contained page.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">
        <NextIntlClientProvider locale="es" messages={{ errors: messages.errors }}>
          <GlobalErrorBody digest={error.digest} reset={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function GlobalErrorBody({ digest, reset }: { digest?: string; reset: () => void }) {
  const t = useTranslations("errors.global");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="max-w-md text-sm text-gray-600">{t("body")}</p>
      <button
        type="button"
        onClick={reset}
        className="cursor-pointer rounded-md border px-4 py-2 text-sm font-medium"
      >
        {t("retry")}
      </button>
      {digest && <p className="text-xs text-gray-400">{digest}</p>}
    </main>
  );
}
