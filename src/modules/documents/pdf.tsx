// React must be in scope explicitly here — same reason as the quote PDF:
// this module is reachable from the worker entry, which runs through
// tsx/esbuild and honours tsconfig's `jsx: "preserve"` as the classic
// runtime.
import React from "react";
import { Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { TenantBranding } from "@/modules/tenancy/settings";
import type { DocumentType, PaymentState, SellerSnapshot } from "./types";
import { getTranslator } from "@/lib/i18n/translator";
import { formatRateLabel, type VatSummaryRow } from "@/lib/se/moms";
import { formatBankgiro, formatOrgNr, formatPlusgiro } from "@/lib/se/identity";
import {
  DocumentShell,
  styles,
  type PdfLineItem,
  type PdfTotalsRow,
} from "@/modules/renderable-document/pdf";
import { documentDate, pdfMoney } from "@/modules/renderable-document/format";

// Faktura- och kreditfaktura-PDF (plan.md §5.2.3).
//
// This document is the phase's legal deliverable, so the checklist it has to
// satisfy is worth naming — mervärdesskattelagen + bokföringslagen, via the
// sweden-business-apps skill §1. Every one of these prints below:
//
//   fakturadatum · löpande fakturanummer · säljarens namn, org.nr och
//   momsregistreringsnummer · köparens namn och adress · varans/tjänstens
//   omfattning och art · leverans-/utförandedatum · beskattningsunderlag per
//   momssats · momssats och momsbelopp per sats · "Godkänd för F-skatt" ·
//   betalvillkor och förfallodatum · bankgiro/plusgiro och OCR
//
// A field missing from this list is not a cosmetic omission — it is an
// invoice a customer's bookkeeper can refuse.
//
// The parties are read from the **snapshots frozen at issue**, not from the
// live contact and tenant rows (modules/documents/documents.ts). Reprinting a
// three-year-old invoice must reproduce it, not re-render it with today's
// addresses.
//
// Everything customer-facing here follows the **tenant's** locale, never the
// viewer's: their customer reads this, not whoever pressed send.
export type DocumentPdfData = {
  type: DocumentType;
  number: string;
  tenantName: string;
  branding: TenantBranding;
  /** Frozen at issue; null on a draft, where the live tenant row is used. */
  seller: SellerSnapshot | null;
  /** Buyer block, already assembled into printable lines. */
  buyerLines: string[];
  currency: string;
  /** Netto — beskattningsunderlag before the rabatt. */
  subtotal: number;
  discount: number;
  /** Netto after the rabatt. */
  total: number;
  vatTotal: number | null;
  vatSummary: VatSummaryRow[];
  /** total + vatTotal — the amount the customer is asked to pay. */
  gross: number;
  amountPaid: number;
  balance: number;
  state: PaymentState;
  dueAt: Date | null;
  deliveryDate: Date | null;
  issuedAt: Date | null;
  ocrNumber: string | null;
  paymentTermsDays: number | null;
  /** The faktura this credits, when this is a kreditfaktura. */
  creditsNumber: string | null;
  notes: string | null;
  createdAt: Date;
  items: Array<PdfLineItem & { vatRateBps: number | null }>;
  locale?: string | null;
};

/** Resolved by renderDocumentPdf: the react-pdf tree renders synchronously
 * and can't await a translator itself. */
export type DocumentPdfLabels = {
  title: string;
  creditTitle: string;
  credits: string;
  client: string;
  invoiceDate: string;
  deliveryDate: string;
  dueAt: string;
  paymentTerms: string;
  description: string;
  qty: string;
  price: string;
  vat: string;
  total: string;
  subtotal: string;
  discount: string;
  net: string;
  vatTotal: string;
  toPay: string;
  paid: string;
  balance: string;
  vatSpecification: string;
  vatRate: string;
  vatBase: string;
  vatAmount: string;
  payment: string;
  bankgiro: string;
  plusgiro: string;
  ocr: string;
  orgNr: string;
  momsRegNr: string;
  fskatt: string;
  notes: string;
  state: Record<PaymentState, string>;
};

const STATE_COLOR: Record<PaymentState, string> = {
  unpaid: "#b45309",
  partial: "#b45309",
  paid: "#15803d",
  void: "#b91c1c",
};

export function FakturaDocument({
  data,
  labels,
}: {
  data: DocumentPdfData;
  labels: DocumentPdfLabels;
}) {
  const locale = data.locale ?? "sv";
  const accent = data.branding.primaryColor || "#111111";
  const isCredit = data.type === "kreditfaktura";
  // pdfMoney, not money: a standard PDF font cannot draw the U+2212 minus
  // that sv-SE formats negatives with, and a kreditfaktura is all negatives.
  const fmt = (amount: number) => pdfMoney(amount, data.currency, locale);

  // Säljaren: name, org.nr and momsregistreringsnummer are all required.
  const seller = data.seller;
  const sellerLines = [
    ...(seller?.orgNr ? [`${labels.orgNr} ${formatOrgNr(seller.orgNr) ?? seller.orgNr}`] : []),
    ...(seller?.momsRegNr ? [`${labels.momsRegNr} ${seller.momsRegNr}`] : []),
  ];

  const totals: PdfTotalsRow[] = [
    { label: labels.subtotal, value: fmt(data.subtotal) },
    // The signed amount actually taken off, not a hardcoded minus in front
    // of a magnitude. On a kreditfaktura the subtotal is negative and the
    // rabatt is added *back*, so a forced "-500,00" under "-13 227,00" would
    // print rows that do not add up to the netto below them.
    ...(data.discount !== 0
      ? [{ label: labels.discount, value: fmt(-data.discount) }]
      : []),
    // Netto is called out on its own line whenever a rabatt moved it, so the
    // beskattningsunderlag the moms is computed on is visible rather than
    // implied.
    ...(data.discount !== 0 ? [{ label: labels.net, value: fmt(data.total) }] : []),
    { label: labels.vatTotal, value: fmt(data.vatTotal ?? 0) },
    {
      label: labels.toPay,
      value: fmt(data.gross),
      kind: "grand" as const,
      valueColor: accent,
    },
    ...(data.amountPaid > 0 ? [{ label: labels.paid, value: `-${fmt(data.amountPaid)}` }] : []),
    ...(isCredit
      ? []
      : [
          {
            label: labels.balance,
            value: fmt(data.balance),
            kind: "balance" as const,
            valueColor: STATE_COLOR[data.state],
          },
        ]),
  ];

  const paymentLines: Array<[string, string]> = [
    ...(seller?.bankgiro
      ? ([[labels.bankgiro, formatBankgiro(seller.bankgiro) ?? seller.bankgiro]] as Array<
          [string, string]
        >)
      : []),
    ...(seller?.plusgiro
      ? ([[labels.plusgiro, formatPlusgiro(seller.plusgiro) ?? seller.plusgiro]] as Array<
          [string, string]
        >)
      : []),
    ...(data.ocrNumber ? ([[labels.ocr, data.ocrNumber]] as Array<[string, string]>) : []),
  ];

  return (
    <DocumentShell
      tenantName={data.tenantName}
      sellerLines={sellerLines}
      branding={data.branding}
      locale={locale}
      currency={data.currency}
      title={isCredit ? labels.creditTitle : labels.title}
      metaLines={[
        data.number,
        `${labels.invoiceDate} ${documentDate(data.issuedAt ?? data.createdAt, locale)}`,
        ...(data.deliveryDate
          ? [`${labels.deliveryDate} ${documentDate(data.deliveryDate, locale)}`]
          : []),
        ...(data.dueAt && !isCredit
          ? [`${labels.dueAt} ${documentDate(data.dueAt, locale)}`]
          : []),
        // A kreditfaktura must say which faktura it reverses, or it is an
        // unexplained negative amount in someone's books.
        ...(isCredit && data.creditsNumber
          ? [`${labels.credits} ${data.creditsNumber}`]
          : []),
      ]}
      stamp={isCredit ? undefined : { text: labels.state[data.state], color: STATE_COLOR[data.state] }}
      clientLabel={labels.client}
      clientLines={data.buyerLines}
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
      tail={
        <>
          {/* Beskattningsunderlag och momsbelopp per momssats — the one
              block a mixed-rate invoice cannot be read without. */}
          {data.vatSummary.length > 0 && (
            <View>
              <Text style={styles.specTitle}>{labels.vatSpecification}</Text>
              <View style={styles.specHeader}>
                <Text style={styles.specRate}>{labels.vatRate}</Text>
                <Text style={styles.specBase}>{labels.vatBase}</Text>
                <Text style={styles.specVat}>{labels.vatAmount}</Text>
              </View>
              {data.vatSummary.map((row) => (
                <View key={row.rateBps} style={styles.specRow}>
                  <Text style={styles.specRate}>{formatRateLabel(row.rateBps)}</Text>
                  <Text style={styles.specBase}>{fmt(row.base)}</Text>
                  <Text style={styles.specVat}>{fmt(row.vat)}</Text>
                </View>
              ))}
            </View>
          )}

          {(paymentLines.length > 0 || (data.paymentTermsDays !== null && !isCredit)) && (
            <View style={styles.payBox}>
              <Text style={styles.payLabel}>{labels.payment}</Text>
              {paymentLines.map(([label, value]) => (
                <Text key={label}>
                  {label} {value}
                </Text>
              ))}
              {data.paymentTermsDays !== null && !isCredit && (
                <Text>
                  {labels.paymentTerms} {data.paymentTermsDays}
                </Text>
              )}
            </View>
          )}

          {/* Required on the face of the invoice when the seller is approved
              for F-skatt: it tells the buyer they are not withholding tax. */}
          {seller?.fSkatt && <Text style={styles.fskatt}>{labels.fskatt}</Text>}

          {data.notes && (
            <View style={styles.notes}>
              <Text style={styles.label}>{labels.notes}</Text>
              <Text>{data.notes}</Text>
            </View>
          )}
        </>
      }
      footer={seller?.invoiceFooter || data.tenantName}
    />
  );
}

export async function renderDocumentPdf(data: DocumentPdfData): Promise<Buffer> {
  const t = await getTranslator(data.locale, "pdf.faktura");
  const labels: DocumentPdfLabels = {
    title: t("title"),
    creditTitle: t("creditTitle"),
    credits: t("credits"),
    client: t("client"),
    invoiceDate: t("invoiceDate"),
    deliveryDate: t("deliveryDate"),
    dueAt: t("dueAt"),
    paymentTerms: t("paymentTerms"),
    description: t("description"),
    qty: t("qty"),
    price: t("price"),
    vat: t("vat"),
    total: t("total"),
    subtotal: t("subtotal"),
    discount: t("discount"),
    net: t("net"),
    vatTotal: t("vatTotal"),
    toPay: t("toPay"),
    paid: t("paid"),
    balance: t("balance"),
    vatSpecification: t("vatSpecification"),
    vatRate: t("vatRate"),
    vatBase: t("vatBase"),
    vatAmount: t("vatAmount"),
    payment: t("payment"),
    bankgiro: t("bankgiro"),
    plusgiro: t("plusgiro"),
    ocr: t("ocr"),
    orgNr: t("orgNr"),
    momsRegNr: t("momsRegNr"),
    fskatt: t("fskatt"),
    notes: t("notes"),
    state: {
      unpaid: t("state.unpaid"),
      partial: t("state.partial"),
      paid: t("state.paid"),
      void: t("state.void"),
    },
  };

  return renderToBuffer(<FakturaDocument data={data} labels={labels} />);
}
