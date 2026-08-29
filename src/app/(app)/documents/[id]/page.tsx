import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import {
  getDocument,
  getCreditNoteFor,
  listDocumentItems,
  getDocumentTotals,
  listPayments,
} from "@/modules/documents/documents";
import { publicDocumentUrl } from "@/modules/documents/delivery";
import { listProducts } from "@/modules/quotes/products";
import { listVatRates } from "@/modules/tenancy/vat-rates";
import { getTenant } from "@/modules/tenancy/tenants";
import { getContact } from "@/modules/crm/contacts";
import { Button } from "@/components/ui/button";
import { DocumentBuilder, type DocumentBuilderLabels } from "../DocumentBuilder";
import { issueDocumentAction, sendDocumentAction, deletePaymentAction } from "../actions";
import { RecordPaymentForm, VoidDocumentForm, CreditNoteForm } from "./DocumentActionForms";
import { formatMoney } from "@/lib/i18n/format";
import { formatRateLabel, parseVatSummary } from "@/lib/se/moms";
import {
  missingInvoiceFields,
  resolveBuyer,
  resolveSeller,
} from "@/modules/documents/presentation";
import { getLocale } from "next-intl/server";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.documents");
  const locale = await getLocale();

  // Agents sell — issue documents, record payments — but the two destructive,
  // ledger-rewriting controls (void, delete payment) are admin-only (§3.2).
  const isAdmin = ctx.role === "admin";

  const document = await getDocument(ctx, id);
  if (!document) notFound();

  const [items, totals, payments, contact, products, vatRates, tenant, creditNote] =
    await Promise.all([
      listDocumentItems(ctx, document.id),
      getDocumentTotals(ctx, document.id),
      listPayments(ctx, document.id),
      getContact(ctx, document.contactId),
      listProducts(ctx),
      listVatRates(ctx),
      getTenant(ctx.tenantId),
      getCreditNoteFor(ctx, document.id),
    ]);

  const isCredit = document.type === "kreditfaktura";
  const vatSummary = parseVatSummary(document.vatSummary);
  const credited = document.creditsDocumentId
    ? await getDocument(ctx, document.creditsDocumentId)
    : null;

  // What a complete faktura still needs. Shown as a warning rather than
  // enforced at issue: the app is not in a position to referee a foreign
  // buyer or an exempt seller, but it can say what a bookkeeper will ask for.
  const missing = missingInvoiceFields(
    resolveBuyer(document.buyerSnapshot, contact),
    resolveSeller(document.sellerSnapshot, tenant),
  );

  const fmt = (n: number) => formatMoney(n, document.currency, locale);
  const publicUrl = publicDocumentUrl(document.publicToken);

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
    submit: t("save"),
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{document.number}</h1>
          <p className="text-sm text-muted-foreground">
            {contact?.name} · {contact?.phone}
          </p>
          <p className="text-sm text-muted-foreground">
            {t(`statusValues.${document.status}` as "statusValues.draft")}
            {totals && document.status !== "draft" && (
              <>
                {" · "}
                {t(`paymentStateValues.${totals.state}` as "paymentStateValues.unpaid")}
              </>
            )}
          </p>
        </div>

        {document.status === "issued" && (
          <form action={sendDocumentAction}>
            <input type="hidden" name="documentId" value={document.id} />
            <Button type="submit">{t("send")}</Button>
          </form>
        )}
      </header>

      {/* The pair of cross-links that make a correction traceable in both
          directions: a faktura says it was credited, a kreditfaktura says
          what it reverses. */}
      {credited && (
        <p className="text-sm">
          <Link href={`/documents/${credited.id}`} className="underline">
            {t("creditsDocument", { number: credited.number })}
          </Link>
        </p>
      )}
      {creditNote && (
        <p className="text-sm">
          <Link href={`/documents/${creditNote.id}`} className="underline">
            {t("creditedBy", { number: creditNote.number })}
          </Link>
        </p>
      )}

      {/* What is still missing for a legally complete faktura. A warning, not
          a block: better to name what a bookkeeper will ask for than to
          refuse to invoice at all. */}
      {missing.length > 0 && document.status === "draft" && (
        <div className="w-fit rounded-md border border-warning/30 bg-warning-surface px-3 py-2 text-xs text-warning">
          <p className="font-medium">{t("missingFieldsTitle")}</p>
          <ul className="mt-1 list-disc pl-4">
            {missing.map((key) => (
              <li key={key}>{t(`missingFields.${key}` as "missingFields.buyerName")}</li>
            ))}
          </ul>
        </div>
      )}

      {document.status === "void" && document.voidReason && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          {t("voidedNotice", { reason: document.voidReason })}
        </p>
      )}

      {document.status === "draft" ? (
        <>
        <h2 className="text-lg font-semibold">{t("editTitle")}</h2>
        <DocumentBuilder
          mode="edit"
          currency={ctx.currency}
          documentId={document.id}
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            unitPrice: p.unitPrice,
            vatRateBps: p.vatRateBps,
          }))}
          vatRates={vatRates.map((rate) => ({ rateBps: rate.rateBps, label: rate.label }))}
          labels={labels}
          initial={{
            lines: items.map((item, index) => ({
              key: index,
              productId: item.productId ?? "",
              description: item.description,
              qty: item.qty,
              unitPrice: item.unitPrice,
              vatRateBps: item.vatRateBps,
            })),
            discount: document.discount,
            dueAt: document.dueAt ? document.dueAt.toISOString().slice(0, 10) : "",
            deliveryDate: document.deliveryDate
              ? document.deliveryDate.toISOString().slice(0, 10)
              : "",
            notes: document.notes ?? "",
          }}
        />
        </>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">{t("description")}</th>
                  <th className="py-2 text-right">{t("qty")}</th>
                  <th className="py-2 text-right">{t("unitPrice")}</th>
                  <th className="py-2 text-right">{t("vatRate")}</th>
                  <th className="py-2 text-right">{t("lineTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2">{item.description}</td>
                    <td className="py-2 text-right">{item.qty}</td>
                    <td className="py-2 text-right">{fmt(item.unitPrice)}</td>
                    <td className="py-2 text-right">
                      {item.vatRateBps === null ? "" : formatRateLabel(item.vatRateBps)}
                    </td>
                    <td className="py-2 text-right">{fmt(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Beskattningsunderlag och momsbelopp per sats — what the PDF
              prints, shown here so a rep can check it before sending. */}
          {vatSummary.length > 0 && (
            <div className="overflow-x-auto">
              <h2 className="mb-2 text-sm font-semibold">{t("vatSpecification")}</h2>
              <table className="w-full max-w-md text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-1">{t("vatRate")}</th>
                    <th className="py-1 text-right">{t("vatBase")}</th>
                    <th className="py-1 text-right">{t("vatAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {vatSummary.map((row) => (
                    <tr key={row.rateBps}>
                      <td className="py-1">{formatRateLabel(row.rateBps)}</td>
                      <td className="py-1 text-right">{fmt(row.base)}</td>
                      <td className="py-1 text-right">{fmt(row.vat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col items-end gap-1 text-sm">
            <div className="flex w-64 justify-between">
              <span>{t("subtotal")}</span>
              <span>{fmt(document.subtotal)}</span>
            </div>
            {document.discount !== 0 && (
              <>
                {/* Signed, so the rows still add up on a kreditfaktura. */}
                <div className="flex w-64 justify-between">
                  <span>{t("discount")}</span>
                  <span>{fmt(-document.discount)}</span>
                </div>
                <div className="flex w-64 justify-between">
                  <span>{t("net")}</span>
                  <span>{fmt(document.total)}</span>
                </div>
              </>
            )}
            <div className="flex w-64 justify-between">
              <span>{t("vatTotal")}</span>
              <span>{fmt(document.vatTotal ?? 0)}</span>
            </div>
            {/* Att betala is the brutto — netto plus moms — which is the
                figure on the payment slip and the one the ledger reconciles
                against. */}
            <div className="flex w-64 justify-between text-base font-semibold">
              <span>{t("total")}</span>
              <span>{fmt(totals?.gross ?? document.total)}</span>
            </div>
            {totals && !isCredit && (
              <>
                <div className="flex w-64 justify-between">
                  <span>{t("amountPaid")}</span>
                  <span>{fmt(totals.amountPaid)}</span>
                </div>
                <div className="flex w-64 justify-between font-medium">
                  <span>{t("balance")}</span>
                  <span>{fmt(totals.balance)}</span>
                </div>
              </>
            )}
          </div>

          {document.ocrNumber && (
            <p className="text-sm text-muted-foreground">
              {t("ocrNumber")}: {document.ocrNumber}
            </p>
          )}
        </>
      )}

      <section className="flex flex-col gap-2 text-sm">
        <p>
          {t("publicLink")}:{" "}
          <a href={publicUrl} className="underline">
            {publicUrl}
          </a>
        </p>
        <a href={`/d/${document.publicToken}/pdf`} className="underline">
          {t("downloadPdf")}
        </a>
      </section>

      {document.status === "draft" && (
        <section>
          <form action={issueDocumentAction} className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{t("issueWarning")}</p>
            <input type="hidden" name="documentId" value={document.id} />
            <Button type="submit" className="w-fit">
              {t("issue")}
            </Button>
          </form>
        </section>
      )}

      {document.status !== "draft" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("paymentsTitle")}</h2>

          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPayments")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2">{t("paidAt")}</th>
                    <th className="py-2">{t("method")}</th>
                    <th className="py-2">{t("reference")}</th>
                    <th className="py-2 text-right">{t("amount")}</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b">
                      <td className="py-2">{payment.paidAt.toISOString().slice(0, 10)}</td>
                      <td className="py-2">
                        {t(`methodValues.${payment.method}` as "methodValues.cash")}
                      </td>
                      <td className="py-2">{payment.reference}</td>
                      <td className="py-2 text-right">{fmt(payment.amount)}</td>
                      <td className="py-2 text-right">
                        {document.status === "issued" && isAdmin && (
                          <form action={deletePaymentAction}>
                            <input type="hidden" name="documentId" value={document.id} />
                            <input type="hidden" name="paymentId" value={payment.id} />
                            <button type="submit" className="text-xs underline">
                              {t("deletePayment")}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {document.status === "issued" && <RecordPaymentForm documentId={document.id} />}
        </section>
      )}

      {/* Voiding retires an unused draft number. An issued faktura is
          räkenskapsinformation and cannot be voided at all — the correction
          route is a kreditfaktura (plan.md §5.2.4). */}
      {document.status === "draft" && isAdmin && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("voidTitle")}</h2>
          <VoidDocumentForm documentId={document.id} />
        </section>
      )}

      {document.status === "issued" && !isCredit && isAdmin && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("creditTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("createCreditWarning")}</p>
          {creditNote ? (
            <p className="text-sm">
              <Link href={`/documents/${creditNote.id}`} className="underline">
                {t("creditedBy", { number: creditNote.number })}
              </Link>
            </p>
          ) : (
            <CreditNoteForm documentId={document.id} />
          )}
        </section>
      )}

      <Link href="/documents" className="text-sm underline underline-offset-4">
        {t("title")}
      </Link>
    </div>
  );
}
