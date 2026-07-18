import { getTranslations } from "next-intl/server";
import { listPlans } from "@/modules/tenancy/plans";
import { Button } from "@/components/ui/button";
import { createPlanAction } from "./actions";

export default async function PlansPage() {
  const t = await getTranslations("superadmin.plans");
  const tc = await getTranslations("common");
  const plans = await listPlans(true);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold">{t("title")}</h1>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">{t("name")}</th>
              <th className="py-2">{t("durationMonths")}</th>
              <th className="py-2">{t("price")}</th>
              <th className="py-2">{t("active")}</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id} className="border-b">
                <td className="py-2">{plan.name}</td>
                <td className="py-2">{plan.durationMonths}</td>
                <td className="py-2">{plan.price.toLocaleString("es-PY")}</td>
                <td className="py-2">{plan.isActive ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("createTitle")}</h2>
        <form action={createPlanAction} className="flex max-w-sm flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("name")}
            <input name="name" required className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("durationMonths")}
            <select name="durationMonths" required className="rounded-md border px-3 py-2">
              <option value="3">3</option>
              <option value="6">6</option>
              <option value="12">12</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("price")}
            <input
              type="number"
              name="price"
              min={1}
              required
              className="rounded-md border px-3 py-2"
            />
          </label>
          <Button type="submit">{tc("create")}</Button>
        </form>
      </section>
    </div>
  );
}
