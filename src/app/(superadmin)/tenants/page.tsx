import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listTenants } from "@/modules/tenancy/tenants";
import { Button } from "@/components/ui/button";
import { createTenantAction, suspendTenantAction, activateTenantAction } from "./actions";

export default async function TenantsPage() {
  const t = await getTranslations("superadmin.tenants");
  const tc = await getTranslations("common");
  const tenants = await listTenants();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold">{t("title")}</h1>
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
        <form action={createTenantAction} className="flex max-w-sm flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("name")}
            <input name="name" required className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("slug")}
            <input name="slug" required className="rounded-md border px-3 py-2" />
          </label>
          <Button type="submit">{tc("create")}</Button>
        </form>
      </section>
    </div>
  );
}
