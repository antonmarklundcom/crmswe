import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import { computeAccessStatus } from "@/modules/tenancy/subscriptions";

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

  const tenant = await getTenant(ctx.tenantId);
  if (!tenant) redirect("/login");

  const status = await computeAccessStatus(tenant.id, tenant.status);

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

  return (
    <div className="flex flex-1 flex-col">
      {graceBanner}
      {children}
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
