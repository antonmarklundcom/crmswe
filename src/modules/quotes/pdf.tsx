// React must be in scope explicitly here. Next's build uses the automatic
// JSX runtime and wouldn't need it, but this module is also reachable from
// the worker entry, which runs through tsx/esbuild — that honours
// tsconfig's `jsx: "preserve"` as the *classic* runtime and fails with
// "React is not defined". An explicit import is correct under both.
import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { TenantBranding } from "@/modules/tenancy/settings";
import { getTranslator } from "@/lib/i18n/translator";
import { formatDate, formatNumber } from "@/lib/i18n/format";

// Quote PDF (PLAN.md §8) rendered with @react-pdf/renderer — pure JS, no
// headless Chrome, because Hostinger managed Node can't run one (§2.3).

export type QuotePdfData = {
  number: string;
  tenantName: string;
  branding: TenantBranding;
  contactName: string;
  contactPhone: string;
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  validUntil: Date | null;
  notes: string | null;
  createdAt: Date;
  items: Array<{ description: string; qty: number; unitPrice: number; lineTotal: number }>;
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
  validUntil: string;
  footer: string;
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

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  logo: { width: 120, maxHeight: 48, objectFit: "contain" },
  tenantName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right" },
  meta: { textAlign: "right", color: "#555", marginTop: 4 },
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
  row: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#ddd" },
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 2, textAlign: "right" },
  colTotal: { flex: 2, textAlign: "right" },
  totals: { marginTop: 12, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 2 },
  grandTotal: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  notes: { marginTop: 24, color: "#444" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", color: "#999", fontSize: 8 },
});

export function QuoteDocument({
  data,
  labels,
}: {
  data: QuotePdfData;
  labels: QuotePdfLabels;
}) {
  const accent = data.branding.primaryColor || "#111111";
  const locale = data.locale ?? "es";

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
            <Text style={styles.meta}>{date(data.createdAt, locale)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{labels.client}</Text>
          <Text>{data.contactName}</Text>
          <Text>{data.contactPhone}</Text>
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
        </View>

        {data.validUntil && (
          <Text style={styles.notes}>
            {labels.validUntil} {date(data.validUntil, locale)}
          </Text>
        )}
        {data.notes && <Text style={styles.notes}>{data.notes}</Text>}

        <Text style={styles.footer}>
          {data.tenantName} · {labels.footer}
        </Text>
      </Page>
    </Document>
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
    validUntil: t("validUntil"),
    footer: t("footer"),
  };

  return renderToBuffer(<QuoteDocument data={data} labels={labels} />);
}
