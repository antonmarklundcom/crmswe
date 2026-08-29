import { Package } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { listProducts } from "@/modules/quotes/products";
import { listVatRates } from "@/modules/tenancy/vat-rates";
import { formatRateLabel } from "@/lib/se/moms";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { toggleProductAction } from "./actions";
import { ProductCreateForm } from "./ProductCreateForm";
import { formatMoney } from "@/lib/i18n/format";
import { getLocale } from "next-intl/server";

export default async function ProductsPage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.products");
  const locale = await getLocale();
  const tc = await getTranslations("common");
  // Agents sell from the catalog, so they still read all of it — but creating
  // a product and taking one out of circulation are admin-only (§3.2), so
  // those controls (and bulk import, which is the same kind of write) are
  // not rendered for them. Export is read-only, so it stays available to
  // everyone who can see the catalog.
  const isAdmin = ctx.role === "admin";
  const [products, vatRates] = await Promise.all([listProducts(ctx, true), listVatRates(ctx)]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <PageHeader
          title={t("title")}
          description={t("intro")}
          action={
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <a href="/api/exports/products">{t("exportCsv")}</a>
              </Button>
              {isAdmin && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/products/import">{t("importAction")}</Link>
                </Button>
              )}
            </div>
          }
        />

        {products.length === 0 ? (
          <EmptyState
            icon={Package}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            actionLabel={isAdmin ? tc("create") : undefined}
            actionHref={isAdmin ? "#nuevo-producto" : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">{t("name")}</th>
                  <th className="py-2 text-right">{t("unitPrice", { currency: ctx.currency })}</th>
                  <th className="py-2 text-right">{t("vatRate")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b">
                    <td className="py-2">
                      {product.name}
                      {!product.isActive && (
                        <span className="ml-2 text-xs text-muted-foreground">({t("inactive")})</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {formatMoney(product.unitPrice, product.currency, locale)}
                    </td>
                    <td className="py-2 text-right">
                      {product.vatRateBps === null ? "" : formatRateLabel(product.vatRateBps)}
                    </td>
                    <td className="py-2 text-right">
                      {isAdmin && (
                        <form action={toggleProductAction}>
                          <input type="hidden" name="productId" value={product.id} />
                          <input
                            type="hidden"
                            name="isActive"
                            value={product.isActive ? "false" : "true"}
                          />
                          <Button type="submit" size="sm" variant="outline">
                            {product.isActive ? t("deactivate") : t("activate")}
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin && (
        <section id="nuevo-producto" className="scroll-mt-6">
          <h2 className="mb-4 text-lg font-semibold">{t("createTitle")}</h2>
          <ProductCreateForm
            currency={ctx.currency}
            vatRates={vatRates.map((rate) => ({ rateBps: rate.rateBps, label: rate.label }))}
          />
        </section>
      )}
    </div>
  );
}
