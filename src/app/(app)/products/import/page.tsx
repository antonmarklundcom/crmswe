import { getTranslations } from "next-intl/server";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import { PageHeader } from "@/components/page-header";
import { ImportProductsForm } from "./ImportProductsForm";

// Product catalog CSV import — admin-only (§3.2), same gate as creating or
// deactivating a product from /products.
export default async function ImportProductsPage() {
  await requireTenantAdmin();
  const t = await getTranslations("app.products.import");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      <ImportProductsForm />
    </div>
  );
}
