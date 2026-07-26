import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getTenantContext } from "@/modules/tenancy/context";

// Tenant suspension/expiry enforcement (PLAN.md §10 1B: "grace → read-only
// banner → locked"). Runs server-side, in the Node.js runtime, so it can
// reach the tenancy module directly (middleware.ts only does the cheap
// unauthenticated-redirect check — see its comment for why).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");

  const status = ctx.accessStatus;

  if (status === "locked") {
    const t = await getTranslations("tenancy.status.locked");
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="max-w-md text-muted-foreground">{t("body")}</p>
        <a href="/login" className="text-sm underline">
          {t("backToLogin")}
        </a>
      </main>
    );
  }

  const graceBanner =
    status === "grace" ? (
      <GraceBanner />
    ) : null;

  const t = await getTranslations("app.nav");

  return (
    <div className="flex flex-1 flex-col">
      {graceBanner}
      <nav className="flex gap-4 border-b px-6 py-3 text-sm">
        <Link href="/dashboard">{t("dashboard")}</Link>
        <Link href="/contacts">{t("contacts")}</Link>
        <Link href="/pipeline">{t("pipeline")}</Link>
        <Link href="/inbox">{t("inbox")}</Link>
        <Link href="/forms">{t("forms")}</Link>
        {ctx.role === "admin" && <Link href="/sites">{t("sites")}</Link>}
        {ctx.role === "admin" && <Link href="/whatsapp">{t("whatsapp")}</Link>}
        {ctx.role === "admin" && <Link href="/settings">{t("settings")}</Link>}
      </nav>
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}

async function GraceBanner() {
  const t = await getTranslations("tenancy.status.grace");
  return (
    <div className="w-full bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
      {t("banner")}
    </div>
  );
}
