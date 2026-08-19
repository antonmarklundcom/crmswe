// SIFEN code tables (PLAN.md §9).
//
// SPEC PROVENANCE. These are the code tables the CDC itself is built from,
// so they are the minimum needed for cdc.ts and nothing more. The full set
// of SIFEN tables (monedas, condiciones de venta, tipos de operación,
// afectación de IVA, departamentos/distritos/ciudades, …) belongs with the
// DE generator, and is deliberately NOT guessed here — it goes in with
// PLAN-SIFEN.md, checked field by field against the Manual Técnico.

/** `iTiDE` — tipo de documento electrónico. CDC positions 1-2. */
export const DOCUMENT_TYPES = {
  factura: 1,
  facturaExportacion: 2,
  facturaImportacion: 3,
  autofactura: 4,
  notaCredito: 5,
  notaDebito: 6,
  notaRemision: 7,
  comprobanteRetencion: 8,
} as const;

export type DocumentTypeName = keyof typeof DOCUMENT_TYPES;
export type DocumentTypeCode = (typeof DOCUMENT_TYPES)[DocumentTypeName];

/** `iTipCont` — tipo de contribuyente emisor. CDC position 25. */
export const TAXPAYER_TYPES = {
  personaFisica: 1,
  personaJuridica: 2,
} as const;

export type TaxpayerTypeName = keyof typeof TAXPAYER_TYPES;
export type TaxpayerTypeCode = (typeof TAXPAYER_TYPES)[TaxpayerTypeName];

/** `iTipEmi` — tipo de emisión. CDC position 34. */
export const EMISSION_TYPES = {
  /** Emitted online, against a live SIFEN. */
  normal: 1,
  /** Emitted while SIFEN is unreachable; submitted later (§9 contingency queue). */
  contingencia: 2,
} as const;

export type EmissionTypeName = keyof typeof EMISSION_TYPES;
export type EmissionTypeCode = (typeof EMISSION_TYPES)[EmissionTypeName];

const codeSet = (table: Record<string, number>) =>
  new Set<number>(Object.values(table));

const DOCUMENT_TYPE_CODES = codeSet(DOCUMENT_TYPES);
const TAXPAYER_TYPE_CODES = codeSet(TAXPAYER_TYPES);
const EMISSION_TYPE_CODES = codeSet(EMISSION_TYPES);

export const isDocumentTypeCode = (v: number): v is DocumentTypeCode =>
  DOCUMENT_TYPE_CODES.has(v);
export const isTaxpayerTypeCode = (v: number): v is TaxpayerTypeCode =>
  TAXPAYER_TYPE_CODES.has(v);
export const isEmissionTypeCode = (v: number): v is EmissionTypeCode =>
  EMISSION_TYPE_CODES.has(v);
