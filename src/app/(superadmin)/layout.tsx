import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSuperadminContext } from "@/modules/tenancy/context";

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSuperadminContext();
  if (!ctx) redirect("/login");

  const t = await getTranslations("superadmin.nav");

  return (
    <div className="flex flex-1 flex-col">
      <nav className="flex gap-4 border-b px-6 py-3 text-sm">
        <Link href="/tenants">{t("tenants")}</Link>
        <Link href="/plans">{t("plans")}</Link>
        <Link href="/whatsapp-health">{t("whatsappHealth")}</Link>
      </nav>
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
