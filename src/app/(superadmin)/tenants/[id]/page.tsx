import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getTenant } from "@/modules/tenancy/tenants";
import { getLatestSubscriptionForTenant } from "@/modules/tenancy/subscriptions";
import { listPlans, getPlan } from "@/modules/tenancy/plans";
import { listUsersForTenant } from "@/modules/tenancy/users";
import { Button } from "@/components/ui/button";
import {
  createSubscriptionAction,
  recordPaymentAction,
  impersonateAction,
} from "./actions";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  const [subscription, plans, users] = await Promise.all([
    getLatestSubscriptionForTenant(id),
    listPlans(),
    listUsersForTenant(id),
  ]);
  const plan = subscription ? await getPlan(subscription.planId) : null;

  const t = await getTranslations("superadmin.tenants");
  const ts = await getTranslations("superadmin.subscriptions");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">{tenant.name}</h1>
        <p className="text-sm text-muted-foreground">{tenant.slug}</p>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{ts("title")}</h2>
        {subscription ? (
          <div className="text-sm">
            <p>
              {ts("plan")}: {plan?.name ?? subscription.planId}
            </p>
            <p>
              {ts("expiresAt")}: {subscription.expiresAt.toISOString()}
            </p>
            <p>
              {ts("accessStatus")}: {subscription.status}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{ts("none")}</p>
        )}
      </section>

      {!subscription && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">{ts("createTitle")}</h2>
          <form action={createSubscriptionAction} className="flex max-w-sm flex-col gap-4">
            <input type="hidden" name="tenantId" value={tenant.id} />
            <label className="flex flex-col gap-1 text-sm">
              {ts("plan")}
              <select name="planId" required className="rounded-md border px-3 py-2">
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">{ts("submit")}</Button>
          </form>
        </section>
      )}

      {subscription && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">{ts("recordPaymentTitle")}</h2>
          <form action={recordPaymentAction} className="flex max-w-sm flex-col gap-4">
            <input type="hidden" name="tenantId" value={tenant.id} />
            <input type="hidden" name="subscriptionId" value={subscription.id} />
            <label className="flex flex-col gap-1 text-sm">
              {ts("amount")}
              <input
                type="number"
                name="amount"
                min={1}
                required
                className="rounded-md border px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {ts("method")}
              <select name="method" required className="rounded-md border px-3 py-2">
                <option value="transfer">{ts("methodValues.transfer")}</option>
                <option value="cash">{ts("methodValues.cash")}</option>
                <option value="other">{ts("methodValues.other")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {ts("reference")}
              <input name="reference" className="rounded-md border px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {ts("notes")}
              <textarea name="notes" className="rounded-md border px-3 py-2" />
            </label>
            <Button type="submit">{ts("submit")}</Button>
          </form>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t("impersonate")}</h2>
        <ul className="flex flex-col gap-2">
          {users.map((user) => (
            <li key={user.id} className="flex items-center gap-3 text-sm">
              <span>
                {user.name} ({user.email}) — {user.role}
              </span>
              <form action={impersonateAction}>
                <input type="hidden" name="userId" value={user.id} />
                <Button type="submit" size="sm" variant="outline">
                  {t("impersonate")}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
