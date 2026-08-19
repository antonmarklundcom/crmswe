// SIFEN engine — public facade (PLAN.md §9).
//
// ══ BOUNDARY RULE, load-bearing ══════════════════════════════════════════
// This module imports NOTHING from other modules. It owns its own tables
// (`sifen_*`) and exposes only the typed surface below. CRM-side integration
// — invoice UI, quote→factura conversion, tenant certificate management —
// belongs in `src/modules/invoicing/`, which *calls* this facade.
//
// That is not tidiness: it is the extraction seam for the standalone
// e-invoicing SaaS §9 anticipates. Extraction later must mean lifting
// `sifen/` and its tables behind an HTTP API, not surgery. Every import
// added here from `@/modules/*` is a future migration made harder, and
// boundary.test.ts fails the build if one appears.
// ═════════════════════════════════════════════════════════════════════════
//
// STATUS: foundation only. The pure, independently verifiable layer is
// implemented and tested (CDC composition, módulo 11, code tables). The
// operations that need the SIFEN Manual Técnico field-by-field — DE XML,
// XMLDSig signing, SOAP submission, KuDE — are declared here with their real
// signatures and throw `SifenNotImplementedError` until Fable's
// PLAN-SIFEN.md specs them (§9: "Fable will author a dedicated
// PLAN-SIFEN.md when Phase 2 starts"). They are declared rather than omitted
// so the shape of the seam is fixed now, while it is cheap to move.

export {
  composeCdc,
  parseCdc,
  isValidCdc,
  generateSecurityCode,
  CdcError,
  CDC_FIELDS,
  CDC_LAYOUT,
  CDC_LENGTH,
} from "./cdc";
export type { Cdc, CdcInput, CdcFieldName } from "./cdc";

export { modulo11CheckDigit, parseRuc, isValidRuc } from "./dv";

export {
  DOCUMENT_TYPES,
  TAXPAYER_TYPES,
  EMISSION_TYPES,
  isDocumentTypeCode,
  isTaxpayerTypeCode,
  isEmissionTypeCode,
} from "./codes";
export type {
  DocumentTypeCode,
  DocumentTypeName,
  TaxpayerTypeCode,
  TaxpayerTypeName,
  EmissionTypeCode,
  EmissionTypeName,
} from "./codes";

export class SifenNotImplementedError extends Error {
  constructor(operation: string, blockedOn: string) {
    super(`SIFEN ${operation} is not implemented yet — blocked on ${blockedOn}`);
    this.name = "SifenNotImplementedError";
  }
}

const pending = (operation: string): never => {
  throw new SifenNotImplementedError(
    operation,
    "PLAN-SIFEN.md (PLAN.md §9 — Fable review gate)",
  );
};

/** Renders a signed-ready DE XML document from a CDC and its document data. */
export function generateDE(): never {
  return pending("generateDE");
}

/** Applies XMLDSig using the tenant's certificate (encrypted at rest, §3.4). */
export function signDE(): never {
  return pending("signDE");
}

/** SOAP submission to SIFEN — sync and batch (§9). */
export function submit(): never {
  return pending("submit");
}

/** Polls SIFEN for the clearance status of a submitted DE. */
export function queryStatus(): never {
  return pending("queryStatus");
}

/** Renders the KuDE representation (PDF + QR) of an approved DE. */
export function generateKuDE(): never {
  return pending("generateKuDE");
}

/** Document events: cancelación, inutilización (§9). */
export function submitEvent(): never {
  return pending("submitEvent");
}
