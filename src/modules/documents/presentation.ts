import { formatOrgNr } from "@/lib/se/identity";
import {
  parseBuyerSnapshot,
  parseSellerSnapshot,
  type BuyerSnapshot,
  type SellerSnapshot,
} from "./types";

// How a faktura's two parties are turned into printable lines (plan.md
// §5.2.3). Pure — no db, no framework — so the PDF, the public page and the
// in-app detail view all say exactly the same thing about the same document.
// Three renderings of one invoice that disagree about the buyer's address is
// precisely the failure the snapshots exist to prevent, and it would be an
// easy one to reintroduce by formatting in three places.

/** The live rows, used only while a document is still a draft. */
export type LiveBuyer = {
  name: string;
  orgNr?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type LiveSeller = {
  name: string;
  orgNr?: string | null;
  momsRegNr?: string | null;
  bankgiro?: string | null;
  plusgiro?: string | null;
  fskatt?: boolean;
  invoiceFooter?: string | null;
};

/**
 * The buyer to print: the snapshot frozen at issue when there is one, the
 * live contact while the document is still a draft.
 *
 * The precedence is the whole point. Once issued, the document says what it
 * said — a customer who moves office does not retroactively change the
 * address on invoices they have already received, and a draft has no history
 * to protect so it shows current data and stays useful to edit against.
 */
export function resolveBuyer(
  snapshot: unknown,
  live: LiveBuyer | null | undefined,
): BuyerSnapshot | null {
  const frozen = parseBuyerSnapshot(snapshot);
  if (frozen) return frozen;
  if (!live) return null;
  return {
    name: live.name,
    orgNr: live.orgNr ?? null,
    addressLine1: live.addressLine1 ?? null,
    addressLine2: live.addressLine2 ?? null,
    postalCode: live.postalCode ?? null,
    city: live.city ?? null,
    country: live.country ?? null,
    email: live.email ?? null,
    phone: live.phone ?? null,
  };
}

/** The seller to print, on the same snapshot-wins rule. */
export function resolveSeller(
  snapshot: unknown,
  live: LiveSeller | null | undefined,
): SellerSnapshot | null {
  const frozen = parseSellerSnapshot(snapshot);
  if (frozen) return frozen;
  if (!live) return null;
  return {
    name: live.name,
    orgNr: live.orgNr ?? null,
    momsRegNr: live.momsRegNr ?? null,
    bankgiro: live.bankgiro ?? null,
    plusgiro: live.plusgiro ?? null,
    fSkatt: live.fskatt === true,
    invoiceFooter: live.invoiceFooter ?? null,
  };
}

/**
 * The buyer block as printed: name, street, "postnummer ort", country when
 * it is not Sweden, then org.nr.
 *
 * Postnummer and ort share a line the Swedish way ("411 03 Göteborg"), and
 * the postcode is grouped in three-plus-two — that is how an address is
 * written here, and an invoice that gets it wrong looks foreign.
 *
 * Blank fields are dropped rather than printed as empty lines, so a contact
 * that only ever supplied a name still produces a tidy block. Whether that is
 * *enough* for a legal invoice is a separate question, and
 * `missingBuyerFields` below is what answers it.
 */
export function buyerLines(buyer: BuyerSnapshot | null, orgNrLabel: string): string[] {
  if (!buyer) return [];
  const lines = [buyer.name];
  if (buyer.addressLine1) lines.push(buyer.addressLine1);
  if (buyer.addressLine2) lines.push(buyer.addressLine2);

  const postal = buyer.postalCode ? formatPostalCode(buyer.postalCode) : null;
  const cityLine = [postal, buyer.city].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);

  // Sweden is the unstated default for a Swedish invoice; anything else has
  // to be said, because it changes how the moms is read.
  if (buyer.country && buyer.country.toUpperCase() !== "SE") lines.push(buyer.country);

  if (buyer.orgNr) lines.push(`${orgNrLabel} ${formatOrgNr(buyer.orgNr) ?? buyer.orgNr}`);
  return lines;
}

/** "41103" → "411 03". Left alone if it isn't five digits. */
export function formatPostalCode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 5 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : raw;
}

/**
 * Which legally required fields are still missing, as message-key suffixes.
 *
 * Deliberately a *warning*, not a validation error that blocks issuing.
 * Refusing to issue would strand a tenant who has not filled in their
 * företagsuppgifter yet and needs to bill someone today, and the app is not
 * in a position to referee edge cases (a foreign buyer, an exempt seller).
 * Naming what is missing, where the user is about to act, is the honest
 * version: it tells them what a bookkeeper will ask about.
 */
export function missingInvoiceFields(
  buyer: BuyerSnapshot | null,
  seller: SellerSnapshot | null,
): string[] {
  const missing: string[] = [];
  if (!seller?.orgNr) missing.push("sellerOrgNr");
  if (!seller?.momsRegNr) missing.push("sellerMomsRegNr");
  if (!seller?.bankgiro && !seller?.plusgiro) missing.push("sellerPaymentAccount");
  if (!buyer?.name) missing.push("buyerName");
  // Street plus a postal town is the minimum that counts as an address.
  if (!buyer?.addressLine1 || !(buyer?.postalCode && buyer?.city)) {
    missing.push("buyerAddress");
  }
  return missing;
}
