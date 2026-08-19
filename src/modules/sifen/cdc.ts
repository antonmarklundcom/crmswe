import { randomInt } from "node:crypto";
import {
  isDocumentTypeCode,
  isEmissionTypeCode,
  isTaxpayerTypeCode,
  type DocumentTypeCode,
  type EmissionTypeCode,
  type TaxpayerTypeCode,
} from "./codes";
import { modulo11CheckDigit, parseRuc } from "./dv";

// CDC — Código de Control (PLAN.md §9). 44 digits that uniquely identify a
// documento electrónico; it is what the KuDE QR encodes and what a buyer
// looks up on e-kuatia.
//
// SPEC PROVENANCE. The 11-field layout below sums to exactly 44 and is the
// composition published by DNIT/e-Kuatia and every reference implementation
// (2+8+1+3+3+7+1+8+1+9+1). The check digit is módulo 11 over the first 43
// digits — see dv.ts for that algorithm's provenance and its pinned vector.
//
// Two properties this module exists to guarantee, both of which are fiscal
// correctness rather than style:
//   1. A CDC is built ONCE and never recomputed. It embeds the emission date
//      and a random security code, so recomputing it for the same document
//      yields a different, equally "valid" string — which is how you end up
//      with two CDCs for one sale. Callers persist what compose() returns.
//   2. Every field is fixed-width and left-zero-padded. A number that
//      overflows its field is an error, never a silent truncation: a
//      truncated establecimiento is a document filed against the wrong shop.

/** Field widths, in CDC order. Exported so tests can assert the layout itself. */
export const CDC_FIELDS = [
  ["documentType", 2],
  ["issuerRuc", 8],
  ["issuerRucDv", 1],
  ["establishment", 3],
  ["pointOfSale", 3],
  ["documentNumber", 7],
  ["taxpayerType", 1],
  ["emissionDate", 8],
  ["emissionType", 1],
  ["securityCode", 9],
  ["checkDigit", 1],
] as const;

export const CDC_LENGTH = 44;

export type CdcFieldName = (typeof CDC_FIELDS)[number][0];

/** `{ field: { offset, width } }`, computed once from CDC_FIELDS. */
export const CDC_LAYOUT: Record<CdcFieldName, { offset: number; width: number }> =
  (() => {
    const layout = {} as Record<CdcFieldName, { offset: number; width: number }>;
    let offset = 0;
    for (const [name, width] of CDC_FIELDS) {
      layout[name] = { offset, width };
      offset += width;
    }
    return layout;
  })();

export type CdcInput = {
  documentType: DocumentTypeCode;
  /** Issuer RUC, with or without its check digit ("80012345-6" or "80012345"). */
  issuerRuc: string;
  /** Establecimiento, 1-999. */
  establishment: number;
  /** Punto de expedición, 1-999. */
  pointOfSale: number;
  /** Número de documento within the timbrado range, 1-9999999. */
  documentNumber: number;
  taxpayerType: TaxpayerTypeCode;
  /**
   * Emission date as `YYYY-MM-DD`. Deliberately a plain date string rather
   * than a `Date`: this module is timezone-free by design, and the tenant's
   * timezone (America/Asuncion, §2.3) is the caller's to apply. Passing a
   * `Date` here is how a document emitted at 21:00 in Asunción gets filed
   * under tomorrow.
   */
  emissionDate: string;
  emissionType: EmissionTypeCode;
  /**
   * Código de seguridad, 9 digits. Omit to have one generated with a CSPRNG.
   * Supply it only when reconstructing a CDC that already exists.
   */
  securityCode?: string;
};

export type Cdc = {
  value: string;
  fields: {
    documentType: DocumentTypeCode;
    issuerRuc: string;
    issuerRucDv: number;
    establishment: number;
    pointOfSale: number;
    documentNumber: number;
    taxpayerType: TaxpayerTypeCode;
    emissionDate: string;
    emissionType: EmissionTypeCode;
    securityCode: string;
    checkDigit: number;
  };
};

export class CdcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CdcError";
  }
}

function pad(value: number | string, field: CdcFieldName): string {
  const { width } = CDC_LAYOUT[field];
  const raw = String(value);
  if (raw.length > width) {
    throw new CdcError(
      `${field} does not fit in ${width} digits (got "${raw}") — a CDC field is never truncated`,
    );
  }
  return raw.padStart(width, "0");
}

function requireIntInRange(
  value: number,
  min: number,
  max: number,
  field: string,
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CdcError(`${field} must be an integer in ${min}..${max} (got ${value})`);
  }
  return value;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function compactDate(date: string): string {
  const match = DATE_PATTERN.exec(date);
  if (!match) {
    throw new CdcError(`emissionDate must be YYYY-MM-DD (got "${date}")`);
  }
  const [, year, month, day] = match;
  // Round-trip through UTC to reject "2026-02-31" and friends, which the
  // regex happily accepts.
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new CdcError(`emissionDate is not a real date ("${date}")`);
  }
  return `${year}${month}${day}`;
}

/**
 * 9 random digits from a CSPRNG. `Math.random()` would be wrong here: the
 * security code is what stops a third party from deriving another
 * taxpayer's CDCs from a sequence of their own.
 */
export function generateSecurityCode(): string {
  let code = "";
  for (let i = 0; i < 9; i++) code += String(randomInt(10));
  // An all-zero code is a legal 9-digit string but reads as "unset" to
  // anyone debugging, and SIFEN treats predictable codes as invalid.
  return code === "000000000" ? generateSecurityCode() : code;
}

export function composeCdc(input: CdcInput): Cdc {
  if (!isDocumentTypeCode(input.documentType)) {
    throw new CdcError(`unknown documentType ${input.documentType}`);
  }
  if (!isTaxpayerTypeCode(input.taxpayerType)) {
    throw new CdcError(`unknown taxpayerType ${input.taxpayerType}`);
  }
  if (!isEmissionTypeCode(input.emissionType)) {
    throw new CdcError(`unknown emissionType ${input.emissionType}`);
  }

  const ruc = parseRuc(input.issuerRuc);
  if (!ruc) throw new CdcError(`malformed issuerRuc "${input.issuerRuc}"`);
  if (ruc.dv !== modulo11CheckDigit(ruc.base)) {
    throw new CdcError(
      `issuerRuc "${input.issuerRuc}" has the wrong check digit — refusing to build a CDC around it`,
    );
  }

  const establishment = requireIntInRange(input.establishment, 1, 999, "establishment");
  const pointOfSale = requireIntInRange(input.pointOfSale, 1, 999, "pointOfSale");
  const documentNumber = requireIntInRange(
    input.documentNumber,
    1,
    9_999_999,
    "documentNumber",
  );

  const securityCode = input.securityCode ?? generateSecurityCode();
  if (!/^\d{9}$/.test(securityCode)) {
    throw new CdcError(`securityCode must be exactly 9 digits (got "${securityCode}")`);
  }

  const body =
    pad(input.documentType, "documentType") +
    pad(ruc.base, "issuerRuc") +
    pad(ruc.dv, "issuerRucDv") +
    pad(establishment, "establishment") +
    pad(pointOfSale, "pointOfSale") +
    pad(documentNumber, "documentNumber") +
    pad(input.taxpayerType, "taxpayerType") +
    compactDate(input.emissionDate) +
    pad(input.emissionType, "emissionType") +
    securityCode;

  // 43 digits in, one check digit out, 44 total.
  const checkDigit = modulo11CheckDigit(body);

  return {
    value: `${body}${checkDigit}`,
    fields: {
      documentType: input.documentType,
      issuerRuc: ruc.base,
      issuerRucDv: ruc.dv,
      establishment,
      pointOfSale,
      documentNumber,
      taxpayerType: input.taxpayerType,
      emissionDate: input.emissionDate,
      emissionType: input.emissionType,
      securityCode,
      checkDigit,
    },
  };
}

/** Reads a stored 44-digit CDC back into its fields. Throws if it doesn't verify. */
export function parseCdc(value: string): Cdc {
  const trimmed = value.trim();
  if (!/^\d{44}$/.test(trimmed)) {
    throw new CdcError(`a CDC is exactly ${CDC_LENGTH} digits (got "${value}")`);
  }

  const body = trimmed.slice(0, 43);
  const checkDigit = Number(trimmed[43]);
  if (modulo11CheckDigit(body) !== checkDigit) {
    throw new CdcError(`CDC check digit does not verify for "${trimmed}"`);
  }

  // Offsets are derived from CDC_FIELDS rather than written out, so the
  // layout is stated exactly once and a parse can never drift from what
  // composeCdc() built.
  const at = (field: CdcFieldName) => {
    const { offset, width } = CDC_LAYOUT[field];
    return body.slice(offset, offset + width);
  };

  const documentType = Number(at("documentType"));
  const taxpayerType = Number(at("taxpayerType"));
  const emissionType = Number(at("emissionType"));

  if (
    !isDocumentTypeCode(documentType) ||
    !isTaxpayerTypeCode(taxpayerType) ||
    !isEmissionTypeCode(emissionType)
  ) {
    throw new CdcError(`CDC "${trimmed}" carries an unknown code table value`);
  }

  const date = at("emissionDate");

  return {
    value: trimmed,
    fields: {
      documentType,
      // Stripped back to the RUC as the taxpayer writes it — the leading
      // zeros are a CDC encoding artifact, and composeCdc pads them on
      // again, so this round-trips exactly.
      issuerRuc: at("issuerRuc").replace(/^0+(?=.)/, ""),
      issuerRucDv: Number(at("issuerRucDv")),
      establishment: Number(at("establishment")),
      pointOfSale: Number(at("pointOfSale")),
      documentNumber: Number(at("documentNumber")),
      taxpayerType,
      emissionDate: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      emissionType,
      securityCode: at("securityCode"),
      checkDigit,
    },
  };
}

/** Non-throwing check, for validating user- or SIFEN-supplied strings. */
export function isValidCdc(value: string): boolean {
  try {
    parseCdc(value);
    return true;
  } catch {
    return false;
  }
}
