import { useTranslations } from "next-intl";

// Placeholder tenant dashboard — CRM core lands in 1C. This page exists so
// (app) layout's suspension/expiry gating (1B) has something to protect.
export default function DashboardPage() {
  const t = useTranslations("common");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
      <h1 className="text-xl font-semibold">{t("appName")}</h1>
    </main>
  );
}
