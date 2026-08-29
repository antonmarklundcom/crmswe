import { describe, expect, it } from "vitest";
import { renderQuotePdf } from "@/modules/quotes/pdf";
import { renderDocumentPdf } from "@/modules/documents/pdf";
import { formatSequenceNumber } from "./format";
import { pdfText } from "./pdf-text";

// Two different guarantees about a customer-facing document, and both are
// needed.
//
// The **fingerprint** suite says the layout did not change by accident: a
// digest over the rendered bytes, with react-pdf's timestamp and file id
// normalised out. Changing how a document looks is allowed — updating the
// digest in the same commit is how you say so out loud.
//
// The **content** suite says the faktura carries what the law requires it to
// carry (plan.md §5.2.3, sweden-business-apps §1). A fingerprint cannot catch
// a missing momsspecifikation, because a document that lost one is perfectly
// stable; only reading the text back can.
//
// Both digests were re-taken in O2: the faktura became a legally complete
// Swedish invoice, and the offert grew a moms column.
const FIXTURE_BRANDING = { primaryColor: "#0f766e" };

const quote = {
  number: "OFF-000123",
  tenantName: "Acme AB",
  branding: FIXTURE_BRANDING,
  contactName: "Anna Gustavsson",
  contactPhone: "+46701234567",
  currency: "SEK",
  subtotal: 1500000,
  discount: 150000,
  total: 1350000,
  validUntil: new Date("2026-03-15T00:00:00.000Z"),
  notes: "Inklusive installation och ett servicebesök.",
  createdAt: new Date("2026-02-01T12:00:00.000Z"),
  locale: "sv",
  // 25 % on both lines: 13 500,00 kr netto → 3 375,00 kr moms.
  vatTotal: 337_500,
  vatSummary: [{ rateBps: 2500, base: 1_350_000, vat: 337_500 }],
  gross: 1_687_500,
  items: [
    {
      description: "Luftvärmepump 12 000 BTU",
      qty: 2,
      unitPrice: 600000,
      lineTotal: 1200000,
      vatRateBps: 2500,
    },
    {
      description: "Installation",
      qty: 1,
      unitPrice: 300000,
      lineTotal: 300000,
      vatRateBps: 2500,
    },
  ],
};

// A mixed-rate faktura — 25 %, 12 % and 6 % on one document, which is the
// case plan.md §5.2 names as the phase's exit criterion and the case every
// rounding decision in lib/se/moms exists for.
const seller = {
  name: "Acme AB",
  orgNr: "5560160680",
  momsRegNr: "SE556016068001",
  bankgiro: "50501113",
  plusgiro: null,
  fSkatt: true,
  invoiceFooter: "Acme AB · Storgatan 1 · 111 22 Stockholm · acme.se",
};

const faktura = {
  type: "faktura" as const,
  number: "FA-000045",
  tenantName: "Acme AB",
  branding: FIXTURE_BRANDING,
  seller,
  buyerLines: [
    "Beställande AB",
    "Kundgatan 5",
    "411 03 Göteborg",
    "Org.nr 556677-8899",
  ],
  currency: "SEK",
  subtotal: 1_376_500,
  discount: 100_000,
  total: 1_276_500,
  vatTotal: 297_795,
  vatSummary: [
    { rateBps: 2500, base: 1_159_200, vat: 289_800 },
    { rateBps: 1200, base: 52_600, vat: 6_312 },
    { rateBps: 600, base: 64_700, vat: 3_882 },
  ],
  gross: 1_574_295,
  amountPaid: 350_000,
  balance: 1_224_295,
  state: "partial" as const,
  dueAt: new Date("2026-03-04T00:00:00.000Z"),
  deliveryDate: new Date("2026-02-02T00:00:00.000Z"),
  issuedAt: new Date("2026-02-02T12:00:00.000Z"),
  ocrNumber: "45566",
  paymentTermsDays: 30,
  creditsNumber: null,
  notes: "Tack för din beställning.",
  createdAt: new Date("2026-02-01T12:00:00.000Z"),
  locale: "sv",
  items: [
    {
      description: "Luftvärmepump 12 000 BTU",
      qty: 2,
      unitPrice: 600_000,
      lineTotal: 1_200_000,
      vatRateBps: 2500,
    },
    { description: "Lunchmöte", qty: 2, unitPrice: 28_500, lineTotal: 57_000, vatRateBps: 1200 },
    {
      description: "Handbok värmepumpar",
      qty: 5,
      unitPrice: 23_900,
      lineTotal: 119_500,
      vatRateBps: 600,
    },
  ],
};

const kreditfaktura = {
  ...faktura,
  type: "kreditfaktura" as const,
  number: "KF-000002",
  creditsNumber: "FA-000045",
  subtotal: -faktura.subtotal,
  discount: -faktura.discount,
  total: -faktura.total,
  vatTotal: -faktura.vatTotal,
  vatSummary: faktura.vatSummary.map((row) => ({
    rateBps: row.rateBps,
    base: -row.base,
    vat: -row.vat,
  })),
  gross: -faktura.gross,
  amountPaid: 0,
  balance: 0,
  state: "unpaid" as const,
  items: faktura.items.map((item) => ({
    ...item,
    unitPrice: -item.unitPrice,
    lineTotal: -item.lineTotal,
  })),
};

async function fingerprint(pdf: Buffer): Promise<string> {
  const { createHash } = await import("node:crypto");
  const normalised = pdf
    .toString("latin1")
    .replace(/D:\d{14}Z/g, "D:00000000000000Z")
    .replace(/\/ID \[<[0-9a-f]+> <[0-9a-f]+>\]/g, "/ID [<0> <0>]");
  return createHash("sha256").update(normalised).digest("hex");
}

describe("document PDFs are pixel-stable", () => {
  it("renders the offert stably", async () => {
    // Re-taken in O2: the offert grew a moms column and quotes inklusive
    // moms, because a private customer reads the quoted figure as the price
    // they will pay.
    const pdf = await renderQuotePdf(quote);
    expect(await fingerprint(pdf)).toBe(
      "ff4323099ab59d5e3693e9371249eef45e58b311a0ab96421a70b224c632c9c5",
    );
  });

  it("renders the faktura stably", async () => {
    const pdf = await renderDocumentPdf(faktura);
    expect(await fingerprint(pdf)).toBe(
      "638844a99edde1f2d41d65897e22f01bdf17affa0ca9856bcaac4e1c1058ce6b",
    );
  });
});

describe("the faktura carries every legally required field", () => {
  // sweden-business-apps §1, item by item. Each of these is something a
  // customer's bookkeeper can reject the invoice for.
  it("prints them all", async () => {
    const text = pdfText(await renderDocumentPdf(faktura));

    // Löpande fakturanummer och fakturadatum.
    expect(text).toContain("FA-000045");
    expect(text).toContain("Fakturadatum");
    // Leverans-/utförandedatum.
    expect(text).toContain("Leveransdatum");
    // Säljarens namn, org.nr och momsregistreringsnummer.
    expect(text).toContain("Acme AB");
    expect(text).toContain("556016-0680");
    expect(text).toContain("SE556016068001");
    // Köparens namn och adress.
    expect(text).toContain("Beställande AB");
    expect(text).toContain("Kundgatan 5");
    expect(text).toContain("411 03 Göteborg");
    // Varans/tjänstens omfattning och art.
    expect(text).toContain("Luftvärmepump 12 000 BTU");
    // Momssats och momsbelopp per sats — the block a mixed-rate invoice
    // cannot be read without.
    expect(text).toContain("Momsspecifikation");
    expect(text).toContain("25\u00a0%");
    expect(text).toContain("12\u00a0%");
    expect(text).toContain("6\u00a0%");
    // Betalvillkor och förfallodatum.
    expect(text).toContain("Förfallodatum");
    expect(text).toContain("Betalningsvillkor");
    // Bankgiro och OCR.
    expect(text).toContain("Bankgiro");
    expect(text).toContain("5050-1113");
    expect(text).toContain("OCR");
    expect(text).toContain("45566");
    // "Godkänd för F-skatt" when the tenant is approved.
    expect(text).toContain("Godkänd för F-skatt");
    // Att betala is the brutto, not the netto.
    expect(text).toContain("Att betala");
  });

  it("prints the beskattningsunderlag and momsbelopp for each rate", async () => {
    const text = pdfText(await renderDocumentPdf(faktura));
    // 11 592,00 kr at 25 % → 2 898,00 kr moms. Rendered with the non-breaking
    // spaces Intl emits for sv-SE.
    for (const amount of ["11\u00a0592,00", "2\u00a0898,00", "526,00", "63,12", "647,00", "38,82"]) {
      expect(text).toContain(amount);
    }
  });

  it("omits the F-skatt line when the seller is not approved", async () => {
    // It is a statement about the seller's tax status. Printing it for a
    // tenant who has not ticked the box would be asserting something untrue
    // on their behalf.
    const text = pdfText(
      await renderDocumentPdf({ ...faktura, seller: { ...seller, fSkatt: false } }),
    );
    expect(text).not.toContain("Godkänd för F-skatt");
  });

  it("prints a rabatt row that the rows above and below still add up with", async () => {
    // Subtotal + rabatt row = beskattningsunderlag, on both document types.
    // A hardcoded minus in front of the magnitude gets this right on a
    // faktura and wrong on a kreditfaktura, where the rabatt is added back
    // to a negative subtotal — printed rows that visibly do not reconcile.
    const invoice = pdfText(await renderDocumentPdf(faktura));
    expect(invoice).toContain("13\u00a0765,00"); // subtotal
    expect(invoice).toContain("-1\u00a0000,00"); // rabatt, taken off
    expect(invoice).toContain("12\u00a0765,00"); // beskattningsunderlag

    const credit = pdfText(await renderDocumentPdf(kreditfaktura));
    expect(credit).toContain("-13\u00a0765,00"); // subtotal
    expect(credit).toContain("1\u00a0000,00"); // rabatt, added back
    expect(credit).toContain("-12\u00a0765,00"); // beskattningsunderlag
  });

  it("names the faktura a kreditfaktura reverses", async () => {
    // A credit note that doesn't say what it credits is an unexplained
    // negative amount in somebody's books.
    const text = pdfText(await renderDocumentPdf(kreditfaktura));
    expect(text).toContain("KREDITFAKTURA");
    expect(text).toContain("Avser faktura");
    expect(text).toContain("FA-000045");
    // Negative amounts, and no balance-due row: a credit note is not
    // something the customer is being asked to pay.
    expect(text).toContain("-15\u00a0742,95");
    expect(text).not.toContain("Kvar att betala");
  });

  it("follows the tenant's locale, not the viewer's", async () => {
    // The customer reads this, not whoever pressed send.
    const text = pdfText(await renderDocumentPdf({ ...faktura, locale: "en" }));
    expect(text).toContain("INVOICE");
    expect(text).toContain("VAT breakdown");
    expect(text).not.toContain("Momsspecifikation");
  });
});

describe("formatSequenceNumber", () => {
  it("pads to six digits, whatever the prefix", () => {
    expect(formatSequenceNumber("OFF", 1)).toBe("OFF-000001");
    expect(formatSequenceNumber("FA", 45)).toBe("FA-000045");
    expect(formatSequenceNumber("KF", 1234567)).toBe("KF-1234567");
  });
});

describe("the offert quotes moms", () => {
  it("shows the momssats per line and totals inklusive moms", async () => {
    // A quoted figure a private customer reads as "the price" must be the
    // one they will actually pay.
    const text = pdfText(await renderQuotePdf(quote));
    expect(text).toContain("25\u00a0%");
    expect(text).toContain("Moms");
    expect(text).toContain("3\u00a0375,00");
    expect(text).toContain("16\u00a0875,00");
  });
});
