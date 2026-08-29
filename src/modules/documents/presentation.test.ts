import { describe, expect, it } from "vitest";
import {
  buyerLines,
  formatPostalCode,
  missingInvoiceFields,
  resolveBuyer,
  resolveSeller,
} from "./presentation";

// How the two parties on a faktura are resolved and printed (plan.md §5.2.3).
//
// The rule these tests exist to pin down is the precedence one: once a
// document is issued, the snapshot frozen onto it wins over the live contact
// and tenant rows, in every rendering. Get that backwards and a customer
// moving office silently rewrites every invoice they were ever sent — which
// is exactly the failure the snapshots were added to prevent, and exactly the
// kind of thing that would look like a harmless refactor.

const liveBuyer = {
  name: "Nya Namnet AB",
  orgNr: "5566778899",
  addressLine1: "Nya Adressen 99",
  addressLine2: null,
  postalCode: "21120",
  city: "Malmö",
  country: "SE",
  email: "faktura@nya.se",
  phone: "+46701234567",
};

const frozenBuyer = {
  name: "Gamla Namnet AB",
  orgNr: "5566778899",
  addressLine1: "Kundgatan 5",
  addressLine2: null,
  postalCode: "41103",
  city: "Göteborg",
  country: "SE",
  email: null,
  phone: null,
};

const liveSeller = {
  name: "Säljande AB",
  orgNr: "5560160680",
  momsRegNr: "SE556016068001",
  bankgiro: "99988875",
  plusgiro: null,
  fskatt: true,
  invoiceFooter: "Säljande AB · Storgatan 1",
};

describe("resolveBuyer / resolveSeller", () => {
  it("prefers the snapshot frozen at issue over the live rows", () => {
    expect(resolveBuyer(frozenBuyer, liveBuyer)?.addressLine1).toBe("Kundgatan 5");
    expect(resolveBuyer(frozenBuyer, liveBuyer)?.city).toBe("Göteborg");

    const frozenSeller = { ...liveSeller, bankgiro: "50501113", fSkatt: false };
    expect(resolveSeller(frozenSeller, liveSeller)?.bankgiro).toBe("50501113");
    // The F-skatt line is a claim about the seller on the invoice date.
    expect(resolveSeller(frozenSeller, liveSeller)?.fSkatt).toBe(false);
  });

  it("falls back to the live rows while the document is still a draft", () => {
    // A draft has no history to protect, so it shows current data and stays
    // useful to edit against.
    expect(resolveBuyer(null, liveBuyer)?.addressLine1).toBe("Nya Adressen 99");
    expect(resolveSeller(null, liveSeller)?.bankgiro).toBe("99988875");
    expect(resolveSeller(null, liveSeller)?.fSkatt).toBe(true);
  });

  it("returns null when there is neither a snapshot nor a live row", () => {
    expect(resolveBuyer(null, null)).toBeNull();
    expect(resolveSeller(undefined, undefined)).toBeNull();
  });

  it("ignores a snapshot whose shape it no longer recognises", () => {
    // A reprint of a very old document must fall back to the live row rather
    // than crash.
    expect(resolveBuyer({ nonsense: true }, liveBuyer)?.name).toBe("Nya Namnet AB");
    expect(resolveBuyer("not an object", liveBuyer)?.name).toBe("Nya Namnet AB");
    expect(resolveBuyer([1, 2, 3], liveBuyer)?.name).toBe("Nya Namnet AB");
  });
});

describe("buyerLines", () => {
  it("prints the block the Swedish way", () => {
    expect(buyerLines(frozenBuyer, "Org.nr")).toEqual([
      "Gamla Namnet AB",
      "Kundgatan 5",
      // Postnummer and ort share a line, postcode grouped 3+2.
      "411 03 Göteborg",
      "Org.nr 556677-8899",
    ]);
  });

  it("drops blank fields instead of printing empty lines", () => {
    expect(
      buyerLines(
        {
          name: "Bara Namnet",
          orgNr: null,
          addressLine1: null,
          addressLine2: null,
          postalCode: null,
          city: null,
          country: null,
          email: null,
          phone: null,
        },
        "Org.nr",
      ),
    ).toEqual(["Bara Namnet"]);
  });

  it("names the country only when it is not Sweden", () => {
    // Sweden is the unstated default on a Swedish invoice; anything else has
    // to be said, because it changes how the moms is read.
    const abroad = { ...frozenBuyer, country: "NO" };
    expect(buyerLines(abroad, "Org.nr")).toContain("NO");
    expect(buyerLines(frozenBuyer, "Org.nr")).not.toContain("SE");
  });

  it("formats the org.nr with its hyphen from the canonical ten digits", () => {
    expect(buyerLines(frozenBuyer, "Org.nr").at(-1)).toBe("Org.nr 556677-8899");
  });

  it("prints an unparseable org.nr as stored rather than dropping it", () => {
    // Inherited data may hold something the validator rejects. Silently
    // omitting a legally required field would be worse than printing it.
    const odd = { ...frozenBuyer, orgNr: "123" };
    expect(buyerLines(odd, "Org.nr").at(-1)).toBe("Org.nr 123");
  });
});

describe("formatPostalCode", () => {
  it("groups five digits three-plus-two", () => {
    expect(formatPostalCode("41103")).toBe("411 03");
    expect(formatPostalCode("411 03")).toBe("411 03");
  });

  it("leaves anything that isn't five digits alone", () => {
    expect(formatPostalCode("SW1A 1AA")).toBe("SW1A 1AA");
    expect(formatPostalCode("1234")).toBe("1234");
  });
});

describe("missingInvoiceFields", () => {
  it("reports nothing when both parties are complete", () => {
    expect(missingInvoiceFields(frozenBuyer, { ...liveSeller, fSkatt: true })).toEqual([]);
  });

  it("names each legally required field that is still missing", () => {
    expect(
      missingInvoiceFields(
        { ...frozenBuyer, addressLine1: null },
        { ...liveSeller, fSkatt: true, orgNr: null, momsRegNr: null, bankgiro: null },
      ),
    ).toEqual(["sellerOrgNr", "sellerMomsRegNr", "sellerPaymentAccount", "buyerAddress"]);
  });

  it("accepts either a bankgiro or a plusgiro as the payment account", () => {
    const withPlusgiro = { ...liveSeller, fSkatt: true, bankgiro: null, plusgiro: "47123450" };
    expect(missingInvoiceFields(frozenBuyer, withPlusgiro)).toEqual([]);
  });

  it("counts a street with no postal town as no address", () => {
    // Half an address is not an address — a bookkeeper cannot post an
    // invoice to a street with no town.
    expect(
      missingInvoiceFields({ ...frozenBuyer, city: null }, { ...liveSeller, fSkatt: true }),
    ).toEqual(["buyerAddress"]);
  });

  it("reports everything when there is nothing at all", () => {
    expect(missingInvoiceFields(null, null)).toEqual([
      "sellerOrgNr",
      "sellerMomsRegNr",
      "sellerPaymentAccount",
      "buyerName",
      "buyerAddress",
    ]);
  });
});
