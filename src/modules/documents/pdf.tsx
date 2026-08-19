// React must be in scope explicitly here — same reason as the quote PDF:
// this module is reachable from the worker entry, which runs through
// tsx/esbuild and honours tsconfig's `jsx: "preserve"` as the classic
// runtime.
import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { TenantBranding } from "@/modules/tenancy/settings";
import type { PaymentState } from "./types";
import { getTranslator } from "@/lib/i18n/translator";
import { formatDate, formatNumber } from "@/lib/i18n/format";

// Nota de venta PDF (PLAN.md §10 1Q), rendered with @react-pdf/renderer for
// the same reason as quotes: pure JS, no headless Chrome on Hostinger (§2.3).
//
// The legal disclaimer in the footer is not decoration. This document is not
// a factura and carries no timbrado, so it must say so on its face — a
// customer who files it as a tax document has a problem, and the cheapest
// place to prevent that is the page itself.
export type DocumentPdfData = {
  number: string;
  tenantName: string;
  branding: TenantBranding;
  contactName: string;
  contactPhone: string;
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  amountPaid: number;
  balance: number;
  state: PaymentState;
  dueAt: Date | null;
  issuedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  items: Array<{ description: string; qty: number; unitPrice: number; lineTotal: number }>;
  /** The **tenant's** locale — this is read by their customer, not by
   * whoever pressed send (PLAN.md §13 H5 #4). */
  locale?: string | null;
};

// PYG has no decimal places (§2.3), so amounts are whole guaraníes and the
// thousands separator is the only formatting needed.
function money(amount: number, currency: string, locale: string): string {
  const formatted = formatNumber(amount, locale, {
    minimumFractionDigits: currency === "PYG" ? 0 : 2,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  });
  return `${currency} ${formatted}`;
}

function date(value: Date, locale: string): string {
  return formatDate(value, locale, { dateStyle: "medium" });
}

/** Resolved by renderDocumentPdf: the react-pdf tree renders synchronously
 * and can't await a translator itself. The disclaimer is not decoration —
 * this document is not a factura and must say so on its face, in whatever
 * language the customer reads. */
export type DocumentPdfLabels = {
  title: string;
  client: string;
  dueAt: string;
  description: string;
  qty: string;
  price: string;
  total: string;
  subtotal: string;
  discount: string;
  paid: string;
  balance: string;
  notes: string;
  disclaimer: string;
  state: Record<PaymentState, string>;
};

const STATE_COLOR: Record<PaymentState, string> = {
  unpaid: "#b45309",
  partial: "#b45309",
  paid: "#15803d",
  void: "#b91c1c",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  logo: { width: 120, maxHeight: 48, objectFit: "contain" },
  tenantName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right" },
  meta: { textAlign: "right", color: "#555", marginTop: 4 },
  stamp: { textAlign: "right", marginTop: 6, fontFamily: "Helvetica-Bold", fontSize: 11 },
  section: { marginBottom: 16 },
  label: { color: "#666", marginBottom: 2 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    paddingBottom: 4,
    marginBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 2, textAlign: "right" },
  colTotal: { flex: 2, textAlign: "right" },
  totals: { marginTop: 12, alignItems: "flex-end" },
  totalsRow: {
    flexDirection: "row",
    width: 240,
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  grandTotal: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  balanceRow: {
    flexDirection: "row",
    width: 240,
    justifyContent: "space-between",
    paddingVertical: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#999",
    fontFamily: "Helvetica-Bold",
  },
  notes: { marginTop: 24, color: "#444" },
  disclaimer: {
    marginTop: 20,
    padding: 8,
    borderWidth: 0.5,
    borderColor: "#bbb",
    color: "#555",
    fontSize: 8,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    color: "#999",
    fontSize: 8,
  },
});

export function NotaVentaDocument({
  data,
  labels,
}: {
  data: DocumentPdfData;
  labels: DocumentPdfLabels;
}) {
  const locale = data.locale ?? "es";
  const accent = data.branding.primaryColor || "#111111";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {data.branding.logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop
              <Image style={styles.logo} src={data.branding.logoUrl} />
            ) : (
              <Text style={[styles.tenantName, { color: accent }]}>{data.tenantName}</Text>
            )}
          </View>
          <View>
            <Text style={[styles.title, { color: accent }]}>{labels.title}</Text>
            <Text style={styles.meta}>{data.number}</Text>
            <Text style={styles.meta}>{date(data.issuedAt ?? data.createdAt, locale)}</Text>
            <Text style={[styles.stamp, { color: STATE_COLOR[data.state] }]}>
              {labels.state[data.state]}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{labels.client}</Text>
          <Text>{data.contactName}</Text>
          <Text>{data.contactPhone}</Text>
          {data.dueAt && (
            <Text style={{ marginTop: 6 }}>{labels.dueAt} {date(data.dueAt, locale)}</Text>
          )}
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>{labels.description}</Text>
          <Text style={styles.colQty}>{labels.qty}</Text>
          <Text style={styles.colPrice}>{labels.price}</Text>
          <Text style={styles.colTotal}>{labels.total}</Text>
        </View>

        {data.items.map((item, index) => (
          <View key={index} style={styles.row}>
            <Text style={styles.colDesc}>{item.description}</Text>
            <Text style={styles.colQty}>{item.qty}</Text>
            <Text style={styles.colPrice}>{money(item.unitPrice, data.currency, locale)}</Text>
            <Text style={styles.colTotal}>{money(item.lineTotal, data.currency, locale)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text>{labels.subtotal}</Text>
            <Text>{money(data.subtotal, data.currency, locale)}</Text>
          </View>
          {data.discount > 0 && (
            <View style={styles.totalsRow}>
              <Text>{labels.discount}</Text>
              <Text>-{money(data.discount, data.currency, locale)}</Text>
            </View>
          )}
          <View style={[styles.totalsRow, styles.grandTotal]}>
            <Text>{labels.total}</Text>
            <Text style={{ color: accent }}>{money(data.total, data.currency, locale)}</Text>
          </View>
          {data.amountPaid > 0 && (
            <View style={styles.totalsRow}>
              <Text>{labels.paid}</Text>
              <Text>-{money(data.amountPaid, data.currency, locale)}</Text>
            </View>
          )}
          <View style={styles.balanceRow}>
            <Text>{labels.balance}</Text>
            <Text style={{ color: STATE_COLOR[data.state] }}>
              {money(data.balance, data.currency, locale)}
            </Text>
          </View>
        </View>

        {data.notes && (
          <View style={styles.notes}>
            <Text style={styles.label}>{labels.notes}</Text>
            <Text>{data.notes}</Text>
          </View>
        )}

        <View style={styles.disclaimer}>
          <Text>{labels.disclaimer}</Text>
        </View>

        <Text style={styles.footer}>{data.tenantName}</Text>
      </Page>
    </Document>
  );
}

export async function renderDocumentPdf(data: DocumentPdfData): Promise<Buffer> {
  const t = await getTranslator(data.locale, "pdf.notaVenta");
  const labels: DocumentPdfLabels = {
    title: t("title"),
    client: t("client"),
    dueAt: t("dueAt"),
    description: t("description"),
    qty: t("qty"),
    price: t("price"),
    total: t("total"),
    subtotal: t("subtotal"),
    discount: t("discount"),
    paid: t("paid"),
    balance: t("balance"),
    notes: t("notes"),
    disclaimer: t("disclaimer"),
    state: {
      unpaid: t("state.unpaid"),
      partial: t("state.partial"),
      paid: t("state.paid"),
      void: t("state.void"),
    },
  };

  return renderToBuffer(<NotaVentaDocument data={data} labels={labels} />);
}
