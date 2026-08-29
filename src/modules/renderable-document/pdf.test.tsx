import { describe, expect, it } from "vitest";
import { renderQuotePdf } from "@/modules/quotes/pdf";
import { renderDocumentPdf } from "@/modules/documents/pdf";
import { formatSequenceNumber } from "./format";

// H9's exit criterion is that the extraction changed no pixels. react-pdf
// stamps a creation timestamp and a random file id; normalising those two
// makes the rest of the output a stable fingerprint of the layout, so this
// suite fails if anyone changes what a customer receives without meaning to.
//
// The digests below were re-taken in O1, when money stopped being "amount +
// currency code" and became a properly formatted currency amount in öre
// (plan.md §1.2) — the fixture prices are minor units, so 150 000 öre is
// 1 500,00 kr. Changing a document's look is allowed; updating the expected
// digest in the same commit is how you say so out loud.
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
  items: [
    { description: "Luftvärmepump 12 000 BTU", qty: 2, unitPrice: 600000, lineTotal: 1200000 },
    { description: "Installation", qty: 1, unitPrice: 300000, lineTotal: 300000 },
  ],
};

const document = {
  ...quote,
  number: "FA-000045",
  amountPaid: 350000,
  balance: 1000000,
  state: "partial" as const,
  dueAt: new Date("2026-03-01T00:00:00.000Z"),
  issuedAt: new Date("2026-02-02T12:00:00.000Z"),
  notes: "Betalningsvillkor 30 dagar.",
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
  it("renders the quote exactly as it did before the shared shell", async () => {
    const pdf = await renderQuotePdf(quote);
    expect(await fingerprint(pdf)).toBe(
      "57bc05c3886c4cb59fb7ff3d5c88b0e36efa70891f507a58854cc6292c15f62f",
    );
  });

  it("renders the faktura exactly as it did before the shared shell", async () => {
    const pdf = await renderDocumentPdf(document);
    expect(await fingerprint(pdf)).toBe(
      "6b9f315ef0ee307486135c5e860e3c88e985d25ad1d0b11874cac92bb175d373",
    );
  });
});

describe("formatSequenceNumber", () => {
  it("pads to six digits, whatever the prefix", () => {
    expect(formatSequenceNumber("OFF", 1)).toBe("OFF-000001");
    expect(formatSequenceNumber("FA", 45)).toBe("FA-000045");
    expect(formatSequenceNumber("KF", 1234567)).toBe("KF-1234567");
  });
});
