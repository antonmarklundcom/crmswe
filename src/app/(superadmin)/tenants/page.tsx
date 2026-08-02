import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listTenants } from "@/modules/tenancy/tenants";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { suspendTenantAction, activateTenantAction } from "./actions";
import { CreateTenantForm } from "./CreateTenantForm";

export default async function TenantsPage() {
  const t = await getTranslations("superadmin.tenants");
  const tenants = await listTenants();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("intro")} />

      <section>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">{t("name")}</th>
              <th className="py-2">{t("slug")}</th>
              <th className="py-2">{t("status")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-b">
                <td className="py-2">
                  <Link href={`/tenants/${tenant.id}`} className="underline">
                    {tenant.name}
                  </Link>
                </td>
                <td className="py-2">{tenant.slug}</td>
                <td className="py-2">
                  {t(`statusValues.${tenant.status}` as "statusValues.active")}
                </td>
                <td className="py-2">
                  {tenant.status === "suspended" ? (
                    <form action={activateTenantAction}>
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <Button type="submit" size="sm" variant="outline">
                        {t("activate")}
                      </Button>
                    </form>
                  ) : (
                    <form action={suspendTenantAction}>
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <Button type="submit" size="sm" variant="outline">
                        {t("suspend")}
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("createTitle")}</h2>
        <CreateTenantForm />
      </section>
    </div>
  );
}
