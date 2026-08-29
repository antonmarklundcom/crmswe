import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getDocumentByPublicToken } from "@/modules/documents/documents";
import { getContact } from "@/modules/crm/contacts";
import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";
import { clientIp } from "@/lib/http/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTranslator } from "@/lib/i18n/translator";
import { documentDate as date, money } from "@/modules/renderable-document/format";
import { formatRateLabel, parseVatSummary } from "@/lib/se/moms";
import { formatBankgiro, formatOrgNr, formatPlusgiro } from "@/lib/se/identity";
import { buyerLines, resolveBuyer, resolveSeller } from "@/modules/documents/presentation";
import type { PaymentState } from "@/modules/documents/types";

// Public read-only faktura view — the token is the secret, same model as the
// offert link (§8). A voided document stops resolving upstream, so this page
// never shows a retired draft as if it stood.
//
// This page and the PDF are two renderings of one document and must agree
// field for field: a customer who opens the link and a bookkeeper who files
// the attachment have to see the same invoice. Both read the parties through
// modules/documents/presentation, and both print the same legally required
// blocks (plan.md §5.2.3).

const STATE_CLASS: Record<PaymentState, string> = {
  unpaid: "bg-warning-surface text-warning",
  partial: "bg-warning-surface text-warning",
  paid: "bg-success-surface text-success",
  void: "bg-destructive-surface text-destructive",
};

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Per-IP limit — the token itself is the secret, so this isn't
  // brute-force defense, it's to keep the page from being hammered.
  const ip = clientIp(await headers());
  if (checkRateLimit(`document-view:${ip}`, 60, 60_000).limited) {
    // No tenant resolved yet, so the reference locale is all there is.
    const tLimit = await getTranslator(null, "public.shared");
    return (
      <main className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">
        {tLimit("rateLimited")}
      </main>
    );
  }

  const resolved = await getDocumentByPublicToken(token);
  if (!resolved) notFound();

  const { document, items, amountPaid, gross, balance, state, ctx } = resolved;
  const [contact, tenant] = await Promise.all([
    getContact(ctx, document.contactId),
    getTenant(document.tenantId),
  ]);
  const branding = ((tenant?.settings ?? {}) as TenantSettings).branding ?? {};
  const accent = branding.primaryColor || undefined;

  // Tenant locale: this page is read by their customer (PLAN.md §13 H5 #4).
  const locale = tenant?.locale ?? "sv";
  const t = await getTranslator(locale, "public.document");

  const isCredit = document.type === "kreditfaktura";
  const seller = resolveSeller(document.sellerSnapshot, tenant);
  const buyer = resolveBuyer(document.buyerSnapshot, contact);
  const lines = buyerLines(buyer, t("orgNr"));
  const vatSummary = parseVatSummary(document.vatSummary);
  const fmt = (amount: number) => money(amount, document.currency, locale);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-supplied external URL, no loader configured
            <img src={branding.logoUrl} alt={tenant?.name ?? ""} className="max-h-12" />
          ) : (
            <h1 className="text-lg font-semibold" style={{ color: accent }}>
              {tenant?.name}
            </h1>
          )}
          {/* Säljarens org.nr och momsregistreringsnummer — required on the
              face of a Swedish faktura, so they belong on the page a customer
              actually opens, not only in the PDF. */}
          <div className="mt-1 text-xs text-muted-foreground">
            {seller?.orgNr && (
              <p>
                {t("orgNr")} {formatOrgNr(seller.orgNr) ?? seller.orgNr}
              </p>
            )}
            {seller?.momsRegNr && (
              <p>
                {t("momsRegNr")} {seller.momsRegNr}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold" style={{ color: accent }}>
            {isCredit ? t("creditTitle") : t("title")}
          </p>
          <p className="text-sm text-muted-foreground">{document.number}</p>
          <p className="text-sm text-muted-foreground">
            {t("invoiceDate")} {date(document.issuedAt ?? document.createdAt, locale)}
          </p>
          {document.deliveryDate && (
            <p className="text-sm text-muted-foreground">
              {t("deliveryDate")} {date(document.deliveryDate, locale)}
            </p>
          )}
          {document.dueAt && !isCredit && (
            <p className="text-sm text-muted-foreground">
              {t("dueAt")} {date(document.dueAt, locale)}
            </p>
          )}
          {!isCredit && (
            <span
              className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${STATE_CLASS[state]}`}
            >
              {t(`state.${state}`)}
            </span>
          )}
        </div>
      </header>

      <section className="text-sm">
        <p className="text-muted-foreground">{t("client")}</p>
        {lines.map((line, index) => (
          <p key={index} className={index === 0 ? undefined : "text-muted-foreground"}>
            {line}
          </p>
        ))}
      </section>

      <section>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">{t("description")}</th>
                <th className="py-2 text-right">{t("qty")}</th>
                <th className="py-2 text-right">{t("price")}</th>
                <th className="py-2 text-right">{t("vat")}</th>
                <th className="py-2 text-right">{t("total")}</th>
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
      </section>

      <section className="ml-auto w-full max-w-xs text-sm">
        <div className="flex justify-between py-1">
          <span>{t("subtotal")}</span>
          <span>{fmt(document.subtotal)}</span>
        </div>
        {document.discount !== 0 && (
          <>
            {/* Signed, so the rows still add up on a kreditfaktura, where
                the rabatt is added back to a negative subtotal. */}
            <div className="flex justify-between py-1">
              <span>{t("discount")}</span>
              <span>{fmt(-document.discount)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>{t("net")}</span>
              <span>{fmt(document.total)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between py-1">
          <span>{t("vatTotal")}</span>
          <span>{fmt(document.vatTotal ?? 0)}</span>
        </div>
        <div className="flex justify-between border-t py-1 font-semibold">
          <span>{t("toPay")}</span>
          <span style={{ color: accent }}>{fmt(gross)}</span>
        </div>
        {amountPaid > 0 && (
          <div className="flex justify-between py-1">
            <span>{t("paid")}</span>
            <span>-{fmt(amountPaid)}</span>
          </div>
        )}
        {!isCredit && (
          <div className="flex justify-between border-t py-2 font-semibold">
            <span>{t("balance")}</span>
            <span>{fmt(balance)}</span>
          </div>
        )}
      </section>

      {/* Beskattningsunderlag och momsbelopp per momssats. A mixed-rate
          invoice is not readable without it, and it is required. */}
      {vatSummary.length > 0 && (
        <section className="text-sm">
          <h2 className="mb-2 font-semibold">{t("vatSpecification")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
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
        </section>
      )}

      {/* Betalningsuppgifter: the block the customer actually needs in order
          to pay — account and OCR together, so a payment reconciles. */}
      {(seller?.bankgiro || seller?.plusgiro || document.ocrNumber) && !isCredit && (
        <section className="rounded-md border p-3 text-sm">
          <p className="mb-1 font-semibold">{t("payment")}</p>
          {seller?.bankgiro && (
            <p>
              {t("bankgiro")} {formatBankgiro(seller.bankgiro) ?? seller.bankgiro}
            </p>
          )}
          {seller?.plusgiro && (
            <p>
              {t("plusgiro")} {formatPlusgiro(seller.plusgiro) ?? seller.plusgiro}
            </p>
          )}
          {document.ocrNumber && (
            <p>
              {t("ocr")} {document.ocrNumber}
            </p>
          )}
          {tenant?.paymentTermsDays !== undefined && tenant?.paymentTermsDays !== null && (
            <p className="text-muted-foreground">
              {t("paymentTerms")} {tenant.paymentTermsDays}
            </p>
          )}
        </section>
      )}

      {seller?.fSkatt && <p className="text-sm font-medium">{t("fskatt")}</p>}

      {document.notes && (
        <section className="text-sm">
          <p className="text-muted-foreground">{t("notes")}</p>
          <p className="whitespace-pre-wrap">{document.notes}</p>
        </section>
      )}

      <a
        href={`/d/${token}/pdf`}
        className="w-fit rounded-md border px-4 py-2 text-sm hover:bg-accent"
      >
        {t("downloadPdf")}
      </a>

      {seller?.invoiceFooter && (
        <p className="text-xs text-muted-foreground">{seller.invoiceFooter}</p>
      )}
    </main>
  );
}
