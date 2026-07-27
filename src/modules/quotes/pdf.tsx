// React must be in scope explicitly here. Next's build uses the automatic
// JSX runtime and wouldn't need it, but this module is also reachable from
// the worker entry, which runs through tsx/esbuild — that honours
// tsconfig's `jsx: "preserve"` as the *classic* runtime and fails with
// "React is not defined". An explicit import is correct under both.
import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { TenantBranding } from "@/modules/tenancy/settings";

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
};

// PYG has no decimal places (§2.3), so amounts are whole guaraníes and the
// thousands separator is the only formatting needed.
function money(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: currency === "PYG" ? 0 : 2,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  }).format(amount);
  return `${currency} ${formatted}`;
}

function date(value: Date): string {
  return new Intl.DateTimeFormat("es-PY", { dateStyle: "medium" }).format(value);
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

export function QuoteDocument({ data }: { data: QuotePdfData }) {
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
            <Text style={[styles.title, { color: accent }]}>PRESUPUESTO</Text>
            <Text style={styles.meta}>{data.number}</Text>
            <Text style={styles.meta}>{date(data.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Cliente</Text>
          <Text>{data.contactName}</Text>
          <Text>{data.contactPhone}</Text>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>Descripción</Text>
          <Text style={styles.colQty}>Cant.</Text>
          <Text style={styles.colPrice}>Precio</Text>
          <Text style={styles.colTotal}>Total</Text>
        </View>

        {data.items.map((item, index) => (
          <View key={index} style={styles.row}>
            <Text style={styles.colDesc}>{item.description}</Text>
            <Text style={styles.colQty}>{item.qty}</Text>
            <Text style={styles.colPrice}>{money(item.unitPrice, data.currency)}</Text>
            <Text style={styles.colTotal}>{money(item.lineTotal, data.currency)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{money(data.subtotal, data.currency)}</Text>
          </View>
          {data.discount > 0 && (
            <View style={styles.totalsRow}>
              <Text>Descuento</Text>
              <Text>-{money(data.discount, data.currency)}</Text>
            </View>
          )}
          <View style={[styles.totalsRow, styles.grandTotal]}>
            <Text>Total</Text>
            <Text style={{ color: accent }}>{money(data.total, data.currency)}</Text>
          </View>
        </View>

        {data.validUntil && (
          <Text style={styles.notes}>Válido hasta: {date(data.validUntil)}</Text>
        )}
        {data.notes && <Text style={styles.notes}>{data.notes}</Text>}

        <Text style={styles.footer}>
          {data.tenantName} · Documento no fiscal · Factura electrónica próximamente
        </Text>
      </Page>
    </Document>
  );
}

export function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
  return renderToBuffer(<QuoteDocument data={data} />);
}
