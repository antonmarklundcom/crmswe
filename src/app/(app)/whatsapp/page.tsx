import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { listAccountsForTenant } from "@/modules/whatsapp/accounts";
import { Button } from "@/components/ui/button";
import { connectAccountAction } from "./actions";

export default async function WhatsappPage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.whatsapp");

  if (ctx.role !== "admin") {
    return <p className="text-muted-foreground">{t("adminOnly")}</p>;
  }

  const accounts = await listAccountsForTenant(ctx);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold">{t("title")}</h1>
        <ul className="flex flex-col gap-2 text-sm">
          {accounts.map((account) => (
            <li key={account.id} className="rounded-md border px-3 py-2">
              <p className="font-medium">{account.displayNumber || account.phoneNumberId}</p>
              <p className="text-muted-foreground">
                {t(`status.${account.status}` as "status.connected")} · {account.connectedVia}
              </p>
            </li>
          ))}
          {accounts.length === 0 && <li className="text-muted-foreground">{t("empty")}</li>}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("connectTitle")}</h2>
        <p className="mb-4 max-w-md text-sm text-muted-foreground">{t("connectHelp")}</p>
        <form action={connectAccountAction} className="flex max-w-sm flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("wabaId")}
            <input name="wabaId" required className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("phoneNumberId")}
            <input name="phoneNumberId" required className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("displayNumber")}
            <input name="displayNumber" className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("accessToken")}
            <input name="accessToken" type="password" required className="rounded-md border px-3 py-2" />
          </label>
          <Button type="submit">{t("connect")}</Button>
        </form>
      </section>
    </div>
  );
}
