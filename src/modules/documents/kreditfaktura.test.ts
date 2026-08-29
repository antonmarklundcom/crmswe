import { describe, expect, it, beforeAll, afterAll } from "vitest";

// Kreditfaktura and the moms engine, end to end through the database
// (plan.md §5.2.1, §5.2.4). `moms.test.ts` proves the arithmetic in
// isolation; this proves that what is *stored* has the same properties —
// that the rates come from configuration, that the summary is frozen onto
// the row, and that a credit note and its faktura cancel to nothing.

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("moms & kreditfaktura (MySQL)", () => {
  let db: (typeof import("@/db/client"))["db"];
  let newId: (typeof import("@/lib/ids"))["newId"];
  let mod: typeof import("./documents");

  type TenantContext = import("@/modules/tenancy/context").TenantContext;
  const superadmin = { userId: "sa-moms-test", impersonatorUserId: null } as const;

  let ctx: TenantContext;
  let contactId: string;

  const phone = () => `+4670${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    ({ newId } = await import("@/lib/ids"));
    mod = await import("./documents");

    const { createTenant } = await import("@/modules/tenancy/tenants");
    const { updateTenantCompanyProfile } = await import("@/modules/tenancy/settings");
    const { buildSystemTenantContext } = await import("@/modules/tenancy/context");
    const { createContact, updateContact } = await import("@/modules/crm/contacts");

    const tenant = await createTenant(superadmin, {
      name: "Momsbolaget AB",
      slug: `moms-${newId()}`,
    });
    ctx = (await buildSystemTenantContext(tenant!.id))!;

    // Företagsuppgifter, so the seller snapshot has something real to freeze.
    await updateTenantCompanyProfile(ctx, {
      orgNr: "5560160680",
      bankgiro: "50501113",
      fskatt: true,
      paymentTermsDays: 30,
      invoiceFooter: "Momsbolaget AB · Storgatan 1 · 111 22 Stockholm",
    });

    const contact = await createContact(ctx, { name: "Köpande AB", phone: phone() });
    contactId = contact!.id;
    await updateContact(ctx, contactId, {
      orgNr: "5566778899",
      addressLine1: "Kundgatan 5",
      postalCode: "41103",
      city: "Göteborg",
      country: "SE",
    });
  });

  afterAll(async () => {
    if (!db) return;
    const pool = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
    await pool.end();
  });

  /** The plan's exit case: one line at each of 25 %, 12 % and 6 %. */
  const mixedLines = [
    { description: "Konsulttimmar", qty: 10, unitPrice: 1_250_00, vatRateBps: 2500 },
    { description: "Lunchmöte", qty: 3, unitPrice: 189_00, vatRateBps: 1200 },
    { description: "Facklitteratur", qty: 2, unitPrice: 349_00, vatRateBps: 600 },
  ];

  it("prices a mixed-rate faktura per line and freezes the per-rate summary", async () => {
    const doc = await mod.createDocument(ctx, { contactId, items: mixedLines });

    const items = await mod.listDocumentItems(ctx, doc!.id);
    expect(items.map((item) => item.vatRateBps)).toEqual([2500, 1200, 600]);
    expect(items.map((item) => item.vatAmount)).toEqual([
      12_500_00 * 0.25,
      567_00 * 0.12,
      698_00 * 0.06,
    ]);

    expect(doc!.subtotal).toBe(12_500_00 + 567_00 + 698_00);
    expect(doc!.total).toBe(doc!.subtotal);
    expect(doc!.vatTotal).toBe(3_125_00 + 68_04 + 41_88);

    // The summary is stored, highest rate first, and its rows add up to the
    // document's own moms total — that is what the PDF prints.
    const { parseVatSummary } = await import("@/lib/se/moms");
    const summary = parseVatSummary(doc!.vatSummary);
    expect(summary).toEqual([
      { rateBps: 2500, base: 12_500_00, vat: 3_125_00 },
      { rateBps: 1200, base: 567_00, vat: 68_04 },
      { rateBps: 600, base: 698_00, vat: 41_88 },
    ]);
    expect(summary.reduce((sum, row) => sum + row.vat, 0)).toBe(doc!.vatTotal);
    expect(summary.reduce((sum, row) => sum + row.base, 0)).toBe(doc!.total);
  });

  it("refuses a momssats the tenant has not configured", async () => {
    // The picker is fed from `vat_rates`, so a rate that isn't in it came
    // from a tampered form — and an arbitrary rate on an invoice is a fiscal
    // problem, not a validation nicety.
    await expect(
      mod.createDocument(ctx, {
        contactId,
        items: [{ description: "Påhittad sats", qty: 1, unitPrice: 100_00, vatRateBps: 1700 }],
      }),
    ).rejects.toThrow(/vat_rate_not_configured/);
  });

  it("falls back to the tenant's default rate when a line names none", async () => {
    const doc = await mod.createDocument(ctx, {
      contactId,
      items: [{ description: "Utan angiven sats", qty: 1, unitPrice: 1_000_00 }],
    });
    const [item] = await mod.listDocumentItems(ctx, doc!.id);
    // The seeded default is flagged in `vat_rates`, not hardcoded here.
    const { defaultVatRateBps } = await import("@/modules/tenancy/vat-rates");
    expect(item.vatRateBps).toBe(await defaultVatRateBps(ctx));
    expect(doc!.vatTotal).toBe(item.vatAmount);
  });

  it("spreads a rabatt across the lines so netto + moms still reconciles", async () => {
    const doc = await mod.createDocument(ctx, {
      contactId,
      items: mixedLines,
      discount: 1_000_00,
    });

    const items = await mod.listDocumentItems(ctx, doc!.id);
    expect(doc!.discount).toBe(1_000_00);
    expect(doc!.total).toBe(doc!.subtotal - 1_000_00);
    expect(items.reduce((sum, item) => sum + (item.vatAmount ?? 0), 0)).toBe(doc!.vatTotal);

    const { parseVatSummary } = await import("@/lib/se/moms");
    const summary = parseVatSummary(doc!.vatSummary);
    expect(summary.reduce((sum, row) => sum + row.base, 0)).toBe(doc!.total);
    expect(summary.reduce((sum, row) => sum + row.vat, 0)).toBe(doc!.vatTotal);
  });

  it("stamps OCR, förfallodatum, leveransdatum and both party snapshots at issue", async () => {
    const doc = await mod.createDocument(ctx, { contactId, items: mixedLines });
    expect(doc!.ocrNumber).toBeNull();
    expect(doc!.buyerSnapshot).toBeNull();

    const issued = await mod.issueDocument(ctx, doc!.id);

    const { isValidOcrNumber } = await import("@/lib/se/identity");
    expect(isValidOcrNumber(issued!.ocrNumber!)).toBe(true);

    // Betalvillkor is the tenant's configured 30 days, counted from issue.
    const days = Math.round(
      (issued!.dueAt!.getTime() - issued!.issuedAt!.getTime()) / 86_400_000,
    );
    expect(days).toBe(30);
    expect(issued!.deliveryDate).toBeTruthy();

    const { parseBuyerSnapshot, parseSellerSnapshot } = await import("./types");
    expect(parseBuyerSnapshot(issued!.buyerSnapshot)).toMatchObject({
      name: "Köpande AB",
      orgNr: "5566778899",
      addressLine1: "Kundgatan 5",
      postalCode: "41103",
      city: "Göteborg",
    });
    expect(parseSellerSnapshot(issued!.sellerSnapshot)).toMatchObject({
      orgNr: "5560160680",
      // Derived from the org.nr when the tenant hasn't entered one directly.
      momsRegNr: "SE556016068001",
      bankgiro: "50501113",
      fSkatt: true,
    });
  });

  it("keeps the issued snapshot even after the contact and tenant change", async () => {
    const doc = await mod.createDocument(ctx, { contactId, items: mixedLines });
    const issued = await mod.issueDocument(ctx, doc!.id);

    const { updateContact } = await import("@/modules/crm/contacts");
    const { updateTenantCompanyProfile } = await import("@/modules/tenancy/settings");
    await updateContact(ctx, contactId, { addressLine1: "Nya Adressen 99", city: "Malmö" });
    await updateTenantCompanyProfile(ctx, { bankgiro: "99988875" });

    // A customer moving office, or the seller changing bank, must not rewrite
    // an invoice that was already sent — that is the whole reason these are
    // snapshots and not joins.
    const { parseBuyerSnapshot, parseSellerSnapshot } = await import("./types");
    const reread = await mod.getDocument(ctx, issued!.id);
    expect(parseBuyerSnapshot(reread!.buyerSnapshot)?.addressLine1).toBe("Kundgatan 5");
    expect(parseBuyerSnapshot(reread!.buyerSnapshot)?.city).toBe("Göteborg");
    expect(parseSellerSnapshot(reread!.sellerSnapshot)?.bankgiro).toBe("50501113");
  });

  it("credits an issued faktura with a kreditfaktura that cancels it exactly", async () => {
    const faktura = await mod.createDocument(ctx, {
      contactId,
      items: mixedLines,
      discount: 777_77,
    });
    const issued = await mod.issueDocument(ctx, faktura!.id);

    const credit = await mod.createCreditNote(ctx, issued!.id, {
      notes: "Felaktigt fakturerad",
    });

    expect(credit!.type).toBe("kreditfaktura");
    expect(credit!.number).toMatch(/^KF-\d{6}$/);
    expect(credit!.creditsDocumentId).toBe(issued!.id);
    expect(credit!.status).toBe("draft");
    // The delivery it reverses is the original's, not today's.
    expect(credit!.deliveryDate?.getTime()).toBe(issued!.deliveryDate?.getTime());

    // The round trip: every money column is the exact negation, so the pair
    // nets to nothing in the ledger.
    expect(credit!.subtotal).toBe(-issued!.subtotal);
    expect(credit!.discount).toBe(-issued!.discount);
    expect(credit!.total).toBe(-issued!.total);
    expect(credit!.vatTotal).toBe(-issued!.vatTotal!);

    const { grossOf } = await import("./types");
    expect(grossOf(credit!) + grossOf(issued!)).toBe(0);

    // Line for line, too — including the moms, which only cancels because
    // the engine rounds away from zero.
    const original = await mod.listDocumentItems(ctx, issued!.id);
    const credited = await mod.listDocumentItems(ctx, credit!.id);
    expect(credited).toHaveLength(original.length);
    for (const [index, line] of credited.entries()) {
      expect(line.description).toBe(original[index].description);
      expect(line.qty).toBe(original[index].qty);
      expect(line.unitPrice).toBe(-original[index].unitPrice);
      expect(line.lineTotal).toBe(-original[index].lineTotal);
      expect(line.vatRateBps).toBe(original[index].vatRateBps);
      expect(line.vatAmount).toBe(-original[index].vatAmount!);
    }

    // And the per-rate summary mirrors the original's, rate for rate.
    const { parseVatSummary } = await import("@/lib/se/moms");
    const before = parseVatSummary(issued!.vatSummary);
    const after = parseVatSummary(credit!.vatSummary);
    expect(after.map((row) => row.rateBps)).toEqual(before.map((row) => row.rateBps));
    for (const [index, row] of after.entries()) {
      expect(row.base).toBe(-before[index].base);
      expect(row.vat).toBe(-before[index].vat);
    }

    // The faktura it credits is untouched by the whole operation.
    const reread = await mod.getDocument(ctx, issued!.id);
    expect(reread!.status).toBe("issued");
    expect(reread!.total).toBe(issued!.total);
    expect(reread!.vatTotal).toBe(issued!.vatTotal);
  });

  it("issues the kreditfaktura on its own series, without disturbing the faktura series", async () => {
    const faktura = await mod.createDocument(ctx, { contactId, items: mixedLines });
    await mod.issueDocument(ctx, faktura!.id);
    const credit = await mod.createCreditNote(ctx, faktura!.id);
    const issuedCredit = await mod.issueDocument(ctx, credit!.id);

    expect(issuedCredit!.status).toBe("issued");
    expect(issuedCredit!.ocrNumber).toBeTruthy();
    expect(issuedCredit!.number.startsWith("KF-")).toBe(true);

    // The next faktura continues the FA series where it left off.
    const next = await mod.createDocument(ctx, { contactId, items: mixedLines });
    expect(next!.number.startsWith("FA-")).toBe(true);
  });

  it("refuses to credit anything but an issued faktura, or to credit twice", async () => {
    const draft = await mod.createDocument(ctx, { contactId, items: mixedLines });
    await expect(mod.createCreditNote(ctx, draft!.id)).rejects.toThrow(
      /only_issued_faktura_can_be_credited/,
    );

    await mod.issueDocument(ctx, draft!.id);
    const credit = await mod.createCreditNote(ctx, draft!.id);

    // A second full credit would reverse the invoice twice over.
    await expect(mod.createCreditNote(ctx, draft!.id)).rejects.toThrow(
      /faktura_already_credited/,
    );

    // And a kreditfaktura is not itself creditable.
    await mod.issueDocument(ctx, credit!.id);
    await expect(mod.createCreditNote(ctx, credit!.id)).rejects.toThrow(
      /only_faktura_can_be_credited/,
    );
  });

  it("refuses to build a kreditfaktura from loose lines", async () => {
    // A credit note that references nothing is not something an accountant
    // can reconcile, so the type is not reachable through the ordinary
    // create path at all.
    await expect(
      mod.createDocument(ctx, {
        contactId,
        type: "kreditfaktura",
        items: mixedLines,
      }),
    ).rejects.toThrow(/credit_note_requires_source/);
  });

  it("takes payment against the brutto, not the netto", async () => {
    const doc = await mod.createDocument(ctx, {
      contactId,
      items: [{ description: "Tjänst", qty: 1, unitPrice: 1_000_00, vatRateBps: 2500 }],
    });
    await mod.issueDocument(ctx, doc!.id);

    // 1 000 kr netto + 250 kr moms: the customer transfers 1 250 kr.
    const partial = await mod.recordPayment(ctx, doc!.id, { amount: 1_000_00 });
    expect(partial!.total).toBe(1_000_00);
    expect(partial!.vatTotal).toBe(250_00);
    expect(partial!.gross).toBe(1_250_00);
    // Paying exactly the netto leaves the moms outstanding — the bug this
    // guards against reported that as "paid".
    expect(partial!.state).toBe("partial");
    expect(partial!.balance).toBe(250_00);

    const settled = await mod.recordPayment(ctx, doc!.id, { amount: 250_00 });
    expect(settled!.state).toBe("paid");
    expect(settled!.balance).toBe(0);
  });
});
