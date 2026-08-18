import { getTranslations } from "next-intl/server";

// Shared by the superadmin (cross-tenant) and tenant-settings (own tenant)
// viewers — listAuditLogForTenant had been written and never rendered
// anywhere (PLAN.md §13 H4). Rows are shown raw on purpose: an audit trail
// that paraphrases what happened is worth less than one that doesn't.
export type AuditEntryRow = {
  id: string;
  tenantId: string | null;
  actorUserId: string;
  impersonatorUserId: string | null;
  action: string;
  entity: string;
  entityId: string;
  createdAt: Date;
};

export async function AuditTable({
  entries,
  showTenant = false,
}: {
  entries: AuditEntryRow[];
  showTenant?: boolean;
}) {
  const t = await getTranslations("audit");

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">{t("when")}</th>
            <th className="py-2">{t("action")}</th>
            <th className="py-2">{t("entity")}</th>
            <th className="py-2">{t("actor")}</th>
            {showTenant && <th className="py-2">{t("tenant")}</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b">
              <td className="py-2 whitespace-nowrap">
                {entry.createdAt.toLocaleString("es-PY")}
              </td>
              <td className="py-2">{entry.action}</td>
              <td className="py-2 font-mono text-xs">
                {entry.entity}/{entry.entityId}
              </td>
              <td className="py-2 font-mono text-xs">
                {entry.actorUserId}
                {entry.impersonatorUserId && (
                  <span className="ml-1 text-muted-foreground">
                    {t("via", { user: entry.impersonatorUserId })}
                  </span>
                )}
              </td>
              {showTenant && (
                <td className="py-2 font-mono text-xs">{entry.tenantId ?? "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
