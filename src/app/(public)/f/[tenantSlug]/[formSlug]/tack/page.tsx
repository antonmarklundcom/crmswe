import { getPublicForm } from "@/modules/forms/submissions";
import { getTranslator } from "@/lib/i18n/translator";

// Same tenant locale as the form the visitor just submitted — falls back to
// the reference locale if the form no longer resolves (PLAN.md §13 H5 #4).
export default async function ThankYouPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; formSlug: string }>;
}) {
  const { tenantSlug, formSlug } = await params;
  const resolved = await getPublicForm(tenantSlug, formSlug);
  const t = await getTranslator(resolved?.tenant.locale, "public.form");

  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">{t("thanksTitle")}</h1>
      <p className="text-muted-foreground">{t("thanksBody")}</p>
    </main>
  );
}
