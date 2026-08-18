import { getTranslations } from "next-intl/server";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import { listAuditLog } from "@/modules/tenancy/audit";
import { PageHeader } from "@/components/page-header";
import { AuditTable } from "@/components/audit-table";

// Cross-tenant audit feed. Defense in depth (§3.3): the layout redirects a
// non-superadmin, but a layout is not an authorization boundary.
export default async function AuditPage() {
  await requireSuperadminContext();
  const t = await getTranslations("audit");
  const entries = await listAuditLog();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      <AuditTable entries={entries} showTenant />
    </div>
  );
}
