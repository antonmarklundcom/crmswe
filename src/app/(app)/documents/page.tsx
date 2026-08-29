import Link from "next/link";
import { ScrollText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { listDocuments, amountPaid } from "@/modules/documents/documents";
import { grossOf, paymentStateOf, type DocumentStatus } from "@/modules/documents/types";
import { listVatRates } from "@/modules/tenancy/vat-rates";
import { listProducts } from "@/modules/quotes/products";
import { listContacts } from "@/modules/crm/contacts";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DocumentBuilder, type DocumentBuilderLabels } from "./DocumentBuilder";
import { formatMoney } from "@/lib/i18n/format";
import { getLocale } from "next-intl/server";

export default async function DocumentsPage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.documents");
  const locale = await getLocale();

  const [documents, contacts, products, vatRates] = await Promise.all([
    listDocuments(ctx),
    listContacts(ctx),
    listProducts(ctx),
    listVatRates(ctx),
  ]);

  const rows = await Promise.all(
    documents.map(async (document) => ({
      document,
      paid: await amountPaid(ctx, document.id),
    })),
  );

  const contactsById = new Map(contacts.map((c) => [c.id, c]));

  const labels: DocumentBuilderLabels = {
    contact: t("contact"),
    description: t("description"),
    qty: t("qty"),
    unitPrice: t("unitPrice"),
    vatRate: t("vatRate"),
    lineTotal: t("lineTotal"),
    addLine: t("addLine"),
    removeLine: t("removeLine"),
    fromCatalog: t("fromCatalog"),
    freeText: t("freeText"),
    discount: t("discount"),
    dueAt: t("dueAt"),
    deliveryDate: t("deliveryDate"),
    notes: t("notes"),
    subtotal: t("subtotal"),
    net: t("net"),
    vatTotal: t("vatTotal"),
    total: t("total"),
    submit: t("create"),
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <PageHeader title={t("title")} description={t("intro")} />

        {/* plan.md §5.2 exit criterion: reports and lists reconcile on the
            netto, and the UI says so rather than leaving a reader to work out
            which of two numbers a column holds. */}
        <p className="text-xs text-muted-foreground">{t("netNotice")}</p>

        {documents.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            actionLabel={contacts.length > 0 ? t("create") : undefined}
            actionHref={contacts.length > 0 ? "#ny-faktura" : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">{t("number")}</th>
                  <th className="py-2">{t("type")}</th>
                  <th className="py-2">{t("contact")}</th>
                  <th className="py-2">{t("status")}</th>
                  <th className="py-2">{t("paymentState")}</th>
                  <th className="py-2 text-right">{t("subtotal")}</th>
                  <th className="py-2 text-right">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ document, paid }) => {
                  // Against the gross: the customer pays netto + moms, so a
                  // state computed on the netto calls every settled invoice
                  // overpaid.
                  const state = paymentStateOf(
                    document.status as DocumentStatus,
                    grossOf(document),
                    paid,
                  );
                  return (
                    <tr key={document.id} className="border-b">
                      <td className="py-2">
                        <Link href={`/documents/${document.id}`} className="underline">
                          {document.number}
                        </Link>
                      </td>
                      <td className="py-2">
                        {t(`typeValues.${document.type}` as "typeValues.faktura")}
                      </td>
                      <td className="py-2">
                        {contactsById.get(document.contactId)?.name ?? document.contactId}
                      </td>
                      <td className="py-2">
                        {t(`statusValues.${document.status}` as "statusValues.draft")}
                      </td>
                      <td className="py-2">
                        {t(`paymentStateValues.${state}` as "paymentStateValues.unpaid")}
                      </td>
                      <td className="py-2 text-right">
                        {formatMoney(document.total, document.currency, locale)}
                      </td>
                      <td className="py-2 text-right">
                        {formatMoney(grossOf(document), document.currency, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="ny-faktura" className="scroll-mt-6">
        <h2 className="mb-4 text-lg font-semibold">{t("createTitle")}</h2>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("needContact")}{" "}
            <Link href="/contacts" className="underline underline-offset-4">
              {t("goToContacts")}
            </Link>
          </p>
        ) : (
          <DocumentBuilder
            mode="create"
            currency={ctx.currency}
            contacts={contacts.map((c) => ({ id: c.id, label: `${c.name} — ${c.phone}` }))}
            products={products.map((p) => ({
              id: p.id,
              name: p.name,
              unitPrice: p.unitPrice,
              vatRateBps: p.vatRateBps,
            }))}
            vatRates={vatRates.map((rate) => ({ rateBps: rate.rateBps, label: rate.label }))}
            labels={labels}
          />
        )}
      </section>
    </div>
  );
}
