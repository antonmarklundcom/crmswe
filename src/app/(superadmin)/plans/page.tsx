import { getTranslations } from "next-intl/server";
import { listPlans } from "@/modules/tenancy/plans";
import { PageHeader } from "@/components/page-header";
import { CreatePlanForm } from "./CreatePlanForm";

export default async function PlansPage() {
  const t = await getTranslations("superadmin.plans");
  const plans = await listPlans(true);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("intro")} />

      <section>
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
        <CreatePlanForm />
      </section>
    </div>
  );
}
