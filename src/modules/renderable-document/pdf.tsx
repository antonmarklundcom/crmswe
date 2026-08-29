// React must be in scope explicitly here. Next's build uses the automatic
// JSX runtime and wouldn't need it, but this module is also reachable from
// the worker entry, which runs through tsx/esbuild — that honours
// tsconfig's `jsx: "preserve"` as the *classic* runtime and fails with
// "React is not defined". An explicit import is correct under both.
import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { TenantBranding } from "@/modules/tenancy/settings";
import { pdfMoney } from "./format";

// The shared PDF shell (PLAN.md §13 H9). The quote and the nota de venta
// were near-identical react-pdf trees; SIFEN's factura (§9) would have been
// a third copy. The shell owns everything both documents agree on — page,
// header, client block, item table, totals, footer — and takes the parts
// they differ in as data: the meta lines under the title, an optional
// stamp, the totals rows, and a tail slot for whatever prints below the
// totals (a validity note, a disclaimer box).
//
// Every style below is byte-for-byte what the two files had, because the
// batch's exit criterion is that the rendered PDFs are unchanged.

export type PdfLineItem = {
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  /** Momssats as printed, e.g. "25 %". Only a faktura supplies it; when any
   * item does, the table grows a moms column (plan.md §5.2.3). */
  vat?: string;
};

export type PdfTotalsRow = {
  label: string;
  /** Pre-formatted, because a discount row prints as "-1 500,00 kr" — a
   * minus sign in front of a formatted amount, not a negated number. */
  value: string;
  /** `grand` is the bold total line; `balance` is the ruled row a faktura
   * closes with. */
  kind?: "row" | "grand" | "balance";
  valueColor?: string;
};

export type DocumentColumns = {
  description: string;
  qty: string;
  price: string;
  total: string;
  /** Header for the per-line momssats column. Supplying it turns the column
   * on; an offert leaves it out and the table is unchanged. */
  vat?: string;
};

export type DocumentShellProps = {
  tenantName: string;
  /** Säljarens namn, org.nr and momsregistreringsnummer — required on a
   * Swedish faktura, absent on an offert (plan.md §5.2.3). */
  sellerLines?: string[];
  branding: TenantBranding;
  locale: string;
  currency: string;
  title: string;
  /** Number, date, and anything else that belongs under the title. */
  metaLines: string[];
  stamp?: { text: string; color: string };
  clientLabel: string;
  clientLines: string[];
  /** A line set apart under the client block — the nota de venta's due
   * date. Node, for the same run-splitting reason as `footer`. */
  clientFooter?: React.ReactNode;
  columns: DocumentColumns;
  items: PdfLineItem[];
  totals: PdfTotalsRow[];
  /** Width of the totals block. The quote has always printed 220pt and the
   * nota de venta 240pt; keeping that difference is cheaper than changing
   * how a customer-facing document looks in a refactor. */
  totalsWidth?: number;
  /** Printed between the totals and the page footer. */
  tail?: React.ReactNode;
  /** Node rather than string so a caller can keep its own text runs — the
   * quote's footer is three of them, and collapsing it into one string
   * changes the kerning react-pdf emits. */
  footer: React.ReactNode;
};

export const styles = StyleSheet.create({
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
  colVat: { flex: 1.2, textAlign: "right" },
  colTotal: { flex: 2, textAlign: "right" },
  seller: { color: "#555", marginTop: 4, fontSize: 8, lineHeight: 1.4 },
  // Momsspecifikation — beskattningsunderlag och momsbelopp per sats.
  specTitle: { marginTop: 20, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  specHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#999",
    paddingBottom: 3,
    fontFamily: "Helvetica-Bold",
  },
  specRow: { flexDirection: "row", paddingVertical: 3 },
  specRate: { flex: 2 },
  specBase: { flex: 3, textAlign: "right" },
  specVat: { flex: 3, textAlign: "right" },
  // Betalningsuppgifter — bankgiro/plusgiro, OCR, betalvillkor.
  payBox: {
    marginTop: 18,
    padding: 8,
    borderWidth: 0.5,
    borderColor: "#999",
    lineHeight: 1.5,
  },
  payLabel: { color: "#666" },
  fskatt: { marginTop: 12, fontFamily: "Helvetica-Bold" },
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

export const DEFAULT_TOTALS_WIDTH = 240;

export function DocumentShell(props: DocumentShellProps) {
  const accent = props.branding.primaryColor || "#111111";
  const totalsWidth = props.totalsWidth ?? DEFAULT_TOTALS_WIDTH;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {props.branding.logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop
              <Image style={styles.logo} src={props.branding.logoUrl} />
            ) : (
              <Text style={[styles.tenantName, { color: accent }]}>{props.tenantName}</Text>
            )}
            {props.sellerLines?.map((line, index) => (
              <Text key={index} style={styles.seller}>
                {line}
              </Text>
            ))}
          </View>
          <View>
            <Text style={[styles.title, { color: accent }]}>{props.title}</Text>
            {props.metaLines.map((line, index) => (
              <Text key={index} style={styles.meta}>
                {line}
              </Text>
            ))}
            {props.stamp && (
              <Text style={[styles.stamp, { color: props.stamp.color }]}>{props.stamp.text}</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{props.clientLabel}</Text>
          {props.clientLines.map((line, index) => (
            <Text key={index}>{line}</Text>
          ))}
          {props.clientFooter && <Text style={{ marginTop: 6 }}>{props.clientFooter}</Text>}
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>{props.columns.description}</Text>
          <Text style={styles.colQty}>{props.columns.qty}</Text>
          <Text style={styles.colPrice}>{props.columns.price}</Text>
          {props.columns.vat && <Text style={styles.colVat}>{props.columns.vat}</Text>}
          <Text style={styles.colTotal}>{props.columns.total}</Text>
        </View>

        {props.items.map((item, index) => (
          <View key={index} style={styles.row}>
            <Text style={styles.colDesc}>{item.description}</Text>
            <Text style={styles.colQty}>{item.qty}</Text>
            <Text style={styles.colPrice}>{pdfMoney(item.unitPrice, props.currency, props.locale)}</Text>
            {props.columns.vat && <Text style={styles.colVat}>{item.vat ?? ""}</Text>}
            <Text style={styles.colTotal}>{pdfMoney(item.lineTotal, props.currency, props.locale)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          {props.totals.map((row, index) => (
            <View
              key={index}
              style={
                row.kind === "grand"
                  ? [styles.totalsRow, styles.grandTotal, { width: totalsWidth }]
                  : row.kind === "balance"
                    ? [styles.balanceRow, { width: totalsWidth }]
                    : [styles.totalsRow, { width: totalsWidth }]
              }
            >
              <Text>{row.label}</Text>
              <Text style={row.valueColor ? { color: row.valueColor } : undefined}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        {props.tail}

        <Text style={styles.footer}>{props.footer}</Text>
      </Page>
    </Document>
  );
}
