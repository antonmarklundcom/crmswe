import { describe, expect, it } from "vitest";
import { renderQuotePdf } from "@/modules/quotes/pdf";
import { renderDocumentPdf } from "@/modules/documents/pdf";
import { formatSequenceNumber } from "./format";

// H9's exit criterion is that the extraction changed no pixels. react-pdf
// stamps a creation timestamp and a random file id; normalising those two
// makes the rest of the output a stable fingerprint of the layout, so this
// suite fails if anyone changes what a customer receives without meaning to.
//
// The digests below were taken from the pre-extraction code. Changing a
// document's look is allowed — updating the expected digest in the same
// commit is how you say so out loud.
const FIXTURE_BRANDING = { primaryColor: "#0f766e" };

const quote = {
  number: "COT-000123",
  tenantName: "Acme SRL",
  branding: FIXTURE_BRANDING,
  contactName: "Ana Gómez",
  contactPhone: "+595981123456",
  currency: "PYG",
  subtotal: 1500000,
  discount: 150000,
  total: 1350000,
  validUntil: new Date("2026-03-15T00:00:00.000Z"),
  notes: "Incluye instalación y una visita de mantenimiento.",
  createdAt: new Date("2026-02-01T12:00:00.000Z"),
  locale: "es",
  items: [
    { description: "Equipo split 12.000 BTU", qty: 2, unitPrice: 600000, lineTotal: 1200000 },
    { description: "Instalación", qty: 1, unitPrice: 300000, lineTotal: 300000 },
  ],
};

const document = {
  ...quote,
  number: "NV-000045",
  amountPaid: 350000,
  balance: 1000000,
  state: "partial" as const,
  dueAt: new Date("2026-03-01T00:00:00.000Z"),
  issuedAt: new Date("2026-02-02T12:00:00.000Z"),
  notes: "Saldo a 30 días.",
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
      "3fc4649897abc19960333f3bbb34bb46f3f0dada52f0041787fb766bd1ee2c12",
    );
  });

  it("renders the nota de venta exactly as it did before the shared shell", async () => {
    const pdf = await renderDocumentPdf(document);
    expect(await fingerprint(pdf)).toBe(
      "404c5d7a07139e4f8fecd536314363d7a860727b2c6744f1a19b37dee2cf9ebf",
    );
  });
});

describe("formatSequenceNumber", () => {
  it("pads to six digits, whatever the prefix", () => {
    expect(formatSequenceNumber("COT", 1)).toBe("COT-000001");
    expect(formatSequenceNumber("NV", 45)).toBe("NV-000045");
    expect(formatSequenceNumber("NV", 1234567)).toBe("NV-1234567");
  });
});
