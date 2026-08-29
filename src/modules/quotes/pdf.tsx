// React must be in scope explicitly here — same reason as the shell it
// builds on (modules/renderable-document/pdf.tsx): this module is reachable
// from the worker entry, which runs through tsx/esbuild and honours
// tsconfig's `jsx: "preserve"` as the classic runtime.
import React from "react";
import { Text, renderToBuffer } from "@react-pdf/renderer";
import type { TenantBranding } from "@/modules/tenancy/settings";
import { getTranslator } from "@/lib/i18n/translator";
import {
  DocumentShell,
  styles,
  type PdfLineItem,
  type PdfTotalsRow,
} from "@/modules/renderable-document/pdf";
import { documentDate, pdfMoney as money } from "@/modules/renderable-document/format";
import { formatRateLabel, type VatSummaryRow } from "@/lib/se/moms";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

// Quote PDF (PLAN.md §8), now a configuration of the shared document shell
// (§13 H9) rather than its own copy of the layout: what is left here is
// only what makes a quote a quote — the validity note, and a footer saying
// this is not a fiscal document.

export type QuotePdfData = {
  number: string;
  tenantName: string;
  branding: TenantBranding;
  contactName: string;
  contactPhone: string;
  currency: string;
  subtotal: number;
  discount: number;
  /** Netto after the rabatt — the beskattningsunderlag. */
  total: number;
  /** Momsbelopp, computed on read: an offert may still change, so unlike a
   * faktura it freezes nothing (modules/quotes/quotes.ts `quoteMoms`). */
  vatTotal: number;
  vatSummary: VatSummaryRow[];
  /** total + vatTotal — the price the customer is being quoted. */
  gross: number;
  validUntil: Date | null;
  notes: string | null;
  createdAt: Date;
  items: Array<PdfLineItem & { vatRateBps: number | null }>;
  /** The **tenant's** locale, never the sending rep's: this document is read
   * by their customer (PLAN.md §13 H5 #4). */
  locale?: string | null;
};

/** Resolved by renderQuotePdf and passed in, because the react-pdf tree is
 * rendered synchronously and can't await a translator itself. */
export type QuotePdfLabels = {
  title: string;
  client: string;
  description: string;
  qty: string;
  price: string;
  total: string;
  subtotal: string;
  discount: string;
  vat: string;
  net: string;
  vatTotal: string;
  validUntil: string;
  footer: string;
};

export function QuoteDocument({
  data,
  labels,
}: {
  data: QuotePdfData;
  labels: QuotePdfLabels;
}) {
  const locale = data.locale ?? DEFAULT_LOCALE;
  const accent = data.branding.primaryColor || "#111111";

  const totals: PdfTotalsRow[] = [
    { label: labels.subtotal, value: money(data.subtotal, data.currency, locale) },
    ...(data.discount > 0
      ? [{ label: labels.discount, value: `-${money(data.discount, data.currency, locale)}` }]
      : []),
    ...(data.discount > 0
      ? [{ label: labels.net, value: money(data.total, data.currency, locale) }]
      : []),
    // An offert quotes what the customer will actually pay, so it names the
    // moms and totals inklusive — a quoted "netto" a private customer reads
    // as the price is the classic complaint about invoicing software here.
    { label: labels.vatTotal, value: money(data.vatTotal, data.currency, locale) },
    {
      label: labels.total,
      value: money(data.gross, data.currency, locale),
      kind: "grand" as const,
      valueColor: accent,
    },
  ];

  return (
    <DocumentShell
      tenantName={data.tenantName}
      branding={data.branding}
      locale={locale}
      currency={data.currency}
      title={labels.title}
      metaLines={[data.number, documentDate(data.createdAt, locale)]}
      clientLabel={labels.client}
      clientLines={[data.contactName, data.contactPhone]}
      columns={{
        description: labels.description,
        qty: labels.qty,
        price: labels.price,
        vat: labels.vat,
        total: labels.total,
      }}
      items={data.items.map((item) => ({
        ...item,
        vat: item.vatRateBps === null ? "" : formatRateLabel(item.vatRateBps),
      }))}
      totals={totals}
      totalsWidth={220}
      tail={
        <>
          {data.validUntil && (
            <Text style={styles.notes}>
              {labels.validUntil} {documentDate(data.validUntil, locale)}
            </Text>
          )}
          {data.notes && <Text style={styles.notes}>{data.notes}</Text>}
        </>
      }
      footer={
        <>
          {data.tenantName} · {labels.footer}
        </>
      }
    />
  );
}

export async function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
  const t = await getTranslator(data.locale, "pdf.quote");
  const labels: QuotePdfLabels = {
    title: t("title"),
    client: t("client"),
    description: t("description"),
    qty: t("qty"),
    price: t("price"),
    total: t("total"),
    subtotal: t("subtotal"),
    discount: t("discount"),
    vat: t("vat"),
    net: t("net"),
    vatTotal: t("vatTotal"),
    validUntil: t("validUntil"),
    footer: t("footer"),
  };

  return renderToBuffer(<QuoteDocument data={data} labels={labels} />);
}
