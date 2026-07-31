// React must be in scope explicitly here — same reason as the quote PDF:
// this module is reachable from the worker entry, which runs through
// tsx/esbuild and honours tsconfig's `jsx: "preserve"` as the classic
// runtime.
import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { TenantBranding } from "@/modules/tenancy/settings";
import type { PaymentState } from "./types";

// Nota de venta PDF (PLAN.md §10 1Q), rendered with @react-pdf/renderer for
// the same reason as quotes: pure JS, no headless Chrome on Hostinger (§2.3).
//
// The legal disclaimer in the footer is not decoration. This document is not
// a factura and carries no timbrado, so it must say so on its face — a
// customer who files it as a tax document has a problem, and the cheapest
// place to prevent that is the page itself.
const DISCLAIMER =
  "Documento no fiscal. Este comprobante no es una factura y no tiene validez tributaria.";

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

const STATE_LABEL: Record<PaymentState, string> = {
  unpaid: "PENDIENTE DE PAGO",
  partial: "PAGO PARCIAL",
  paid: "PAGADO",
  void: "ANULADO",
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

export function NotaVentaDocument({ data }: { data: DocumentPdfData }) {
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
            <Text style={[styles.title, { color: accent }]}>NOTA DE VENTA</Text>
            <Text style={styles.meta}>{data.number}</Text>
            <Text style={styles.meta}>{date(data.issuedAt ?? data.createdAt)}</Text>
            <Text style={[styles.stamp, { color: STATE_COLOR[data.state] }]}>
              {STATE_LABEL[data.state]}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Cliente</Text>
          <Text>{data.contactName}</Text>
          <Text>{data.contactPhone}</Text>
          {data.dueAt && (
            <Text style={{ marginTop: 6 }}>Vencimiento: {date(data.dueAt)}</Text>
          )}
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
          {data.amountPaid > 0 && (
            <View style={styles.totalsRow}>
              <Text>Pagado</Text>
              <Text>-{money(data.amountPaid, data.currency)}</Text>
            </View>
          )}
          <View style={styles.balanceRow}>
            <Text>Saldo</Text>
            <Text style={{ color: STATE_COLOR[data.state] }}>
              {money(data.balance, data.currency)}
            </Text>
          </View>
        </View>

        {data.notes && (
          <View style={styles.notes}>
            <Text style={styles.label}>Notas</Text>
            <Text>{data.notes}</Text>
          </View>
        )}

        <View style={styles.disclaimer}>
          <Text>{DISCLAIMER}</Text>
        </View>

        <Text style={styles.footer}>{data.tenantName}</Text>
      </Page>
    </Document>
  );
}

export async function renderDocumentPdf(data: DocumentPdfData): Promise<Buffer> {
  return renderToBuffer(<NotaVentaDocument data={data} />);
}
