import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { computeLineTotals } from "@/lib/money";
import { balanceOf, paymentStateOf } from "./types";
import { formatDocumentNumber } from "./numbering";

// Non-fiscal documents (PLAN.md §10 1Q). The money helpers are pure and
// tested directly; the immutability invariant and the payment ledger need a
// real MySQL, same convention as the other suites.

describe("computeLineTotals", () => {
  it("derives line totals and the subtotal from qty × price", () => {
    const result = computeLineTotals([
      { description: "Instalación", qty: 2, unitPrice: 350_000 },
      { description: "Mantenimiento", qty: 1, unitPrice: 150_000 },
    ]);
    expect(result.lines[0].lineTotal).toBe(700_000);
    expect(result.subtotal).toBe(850_000);
    expect(result.total).toBe(850_000);
  });

  it("clamps a discount larger than the subtotal instead of going negative", () => {
    const result = computeLineTotals([{ description: "x", qty: 1, unitPrice: 100 }], 500);
    expect(result.discount).toBe(100);
    expect(result.total).toBe(0);
  });

  it("ignores a negative discount", () => {
    const result = computeLineTotals([{ description: "x", qty: 1, unitPrice: 100 }], -50);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(100);
  });
});

describe("paymentStateOf / balanceOf", () => {
  it("reports unpaid, partial and paid from the ledger sum", () => {
    expect(paymentStateOf("issued", 1000, 0)).toBe("unpaid");
    expect(paymentStateOf("issued", 1000, 400)).toBe("partial");
    expect(paymentStateOf("issued", 1000, 1000)).toBe("paid");
  });

  it("treats an overpayment as paid, not partial, and owes nothing", () => {
    expect(paymentStateOf("issued", 1000, 1200)).toBe("paid");
    expect(balanceOf(1000, 1200)).toBe(0);
  });

  it("reports a voided document as void regardless of the ledger", () => {
    expect(paymentStateOf("void", 1000, 0)).toBe("void");
    expect(paymentStateOf("void", 1000, 500)).toBe("void");
  });
});

describe("formatDocumentNumber", () => {
  it("zero-pads to six digits behind the type prefix", () => {
    expect(formatDocumentNumber("FA", 1)).toBe("FA-000001");
    expect(formatDocumentNumber("KF", 123456)).toBe("KF-123456");
  });
});

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("documents (MySQL)", () => {
  let db: (typeof import("@/db/client"))["db"];
  let newId: (typeof import("@/lib/ids"))["newId"];
  let mod: typeof import("./documents");

  type TenantContext = import("@/modules/tenancy/context").TenantContext;
  const superadmin = { userId: "sa-test", impersonatorUserId: null } as const;

  let ctxA: TenantContext;
  let ctxB: TenantContext;
  let contactA: string;

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    ({ newId } = await import("@/lib/ids"));
    mod = await import("./documents");

    const { createTenant } = await import("@/modules/tenancy/tenants");
    const { buildSystemTenantContext } = await import("@/modules/tenancy/context");
    const { createContact } = await import("@/modules/crm/contacts");

    const tenantA = await createTenant(superadmin, {
      name: "Doc Tenant A",
      slug: `doc-a-${newId()}`,
    });
    const tenantB = await createTenant(superadmin, {
      name: "Doc Tenant B",
      slug: `doc-b-${newId()}`,
    });
    ctxA = (await buildSystemTenantContext(tenantA!.id))!;
    ctxB = (await buildSystemTenantContext(tenantB!.id))!;

    const contact = await createContact(ctxA, {
      name: "Cliente NV",
      phone: `+4670${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
    });
    contactA = contact!.id;
  });

  afterAll(async () => {
    if (!db) return;
    const pool = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
    await pool.end();
  });

  const lines = [{ description: "Instalación split 12k", qty: 1, unitPrice: 2_500_000 }];

  it("numbers per tenant, starting each tenant at FA-000001", async () => {
    const a1 = await mod.createDocument(ctxA, { contactId: contactA, items: lines });
    const a2 = await mod.createDocument(ctxA, { contactId: contactA, items: lines });
    expect(a1!.number).toBe("FA-000001");
    expect(a2!.number).toBe("FA-000002");

    const { createContact } = await import("@/modules/crm/contacts");
    const contactB = await createContact(ctxB, {
      name: "Otro",
      phone: `+4670${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
    });
    const b1 = await mod.createDocument(ctxB, { contactId: contactB!.id, items: lines });
    // Sequences are per tenant — B's first document is its own FA-000001,
    // not a continuation of A's run.
    expect(b1!.number).toBe("FA-000001");
  });

  it("allows editing a draft and refuses every edit once issued", async () => {
    const doc = await mod.createDocument(ctxA, { contactId: contactA, items: lines });

    const edited = await mod.updateDraftDocument(ctxA, doc!.id, {
      items: [{ description: "Instalación + soporte", qty: 2, unitPrice: 2_500_000 }],
    });
    expect(edited!.total).toBe(5_000_000);
    expect(await mod.listDocumentItems(ctxA, doc!.id)).toHaveLength(1);

    const issued = await mod.issueDocument(ctxA, doc!.id);
    expect(issued!.status).toBe("issued");
    expect(issued!.issuedAt).toBeTruthy();

    // The one-way door.
    await expect(
      mod.updateDraftDocument(ctxA, doc!.id, { items: lines }),
    ).rejects.toThrow(/document_not_draft/);
    await expect(mod.issueDocument(ctxA, doc!.id)).rejects.toThrow(/document_not_draft/);
  });

  it("refuses payments on a draft and accepts them once issued", async () => {
    const doc = await mod.createDocument(ctxA, { contactId: contactA, items: lines });

    await expect(mod.recordPayment(ctxA, doc!.id, { amount: 100 })).rejects.toThrow(
      /payment_requires_issued_document/,
    );

    await mod.issueDocument(ctxA, doc!.id);
    await expect(mod.recordPayment(ctxA, doc!.id, { amount: 0 })).rejects.toThrow(
      /payment_must_be_positive/,
    );

    // The customer owes the *brutto*: 2 500 000 öre netto at the seeded 25 %
    // default is 3 125 000 öre on the payment slip. Reconciling against the
    // netto would call a fully paid invoice overpaid.
    const gross = 3_125_000;
    const after = await mod.recordPayment(ctxA, doc!.id, {
      amount: 1_000_000,
      method: "transfer",
    });
    expect(after!.gross).toBe(gross);
    expect(after!.total).toBe(2_500_000);
    expect(after!.vatTotal).toBe(625_000);
    expect(after!.amountPaid).toBe(1_000_000);
    expect(after!.balance).toBe(gross - 1_000_000);
    expect(after!.state).toBe("partial");

    const paid = await mod.recordPayment(ctxA, doc!.id, {
      amount: gross - 1_000_000,
      method: "cash",
    });
    expect(paid!.state).toBe("paid");
    expect(paid!.balance).toBe(0);
  });

  it("voids a draft, and refuses to void anything already issued", async () => {
    // Abandoning a draft retires its number rather than reusing it, so the
    // series stays unbroken.
    const draft = await mod.createDocument(ctxA, { contactId: contactA, items: lines });
    const voided = await mod.voidDocument(ctxA, draft!.id, "skapad av misstag");
    expect(voided!.status).toBe("void");
    expect(voided!.voidReason).toBe("skapad av misstag");

    // An issued faktura is räkenskapsinformation. Voiding it would take a
    // live invoice out of the series instead of recording that it was
    // reversed — the correction route is a kreditfaktura (plan.md §5.2.4).
    const issued = await mod.createDocument(ctxA, { contactId: contactA, items: lines });
    await mod.issueDocument(ctxA, issued!.id);
    await expect(mod.voidDocument(ctxA, issued!.id, "fel belopp")).rejects.toThrow(
      /issued_document_requires_credit_note/,
    );
    expect((await mod.getDocument(ctxA, issued!.id))!.status).toBe("issued");
  });

  it("copies quote lines by value, so a later change to the quote can't rewrite the document", async () => {
    const { createQuote, listQuoteItems } = await import("@/modules/quotes/quotes");
    const schema = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const quote = await createQuote(ctxA, {
      contactId: contactA,
      items: [{ description: "Servicio", qty: 1, unitPrice: 900_000 }],
    });

    const doc = await mod.createDocumentFromQuote(ctxA, quote!.id);
    expect(doc!.total).toBe(900_000);
    expect(doc!.quoteId).toBe(quote!.id);

    // The document owns its own item rows, not references to the quote's.
    const quoteItemIds = (await listQuoteItems(ctxA, quote!.id)).map((i) => i.id);
    const docItems = await mod.listDocumentItems(ctxA, doc!.id);
    expect(docItems).toHaveLength(1);
    expect(quoteItemIds).not.toContain(docItems[0].id);

    // Mutating the quote's stored lines and header underneath leaves the
    // issued record exactly as the customer received it.
    await db
      .update(schema.quoteItems)
      .set({ qty: 5, lineTotal: 4_500_000 })
      .where(eq(schema.quoteItems.quoteId, quote!.id));
    await db
      .update(schema.quotes)
      .set({ subtotal: 4_500_000, total: 4_500_000 })
      .where(eq(schema.quotes.id, quote!.id));

    const reread = await mod.getDocument(ctxA, doc!.id);
    expect(reread!.total).toBe(900_000);
    const rereadItems = await mod.listDocumentItems(ctxA, doc!.id);
    expect(rereadItems[0].qty).toBe(1);
    expect(rereadItems[0].lineTotal).toBe(900_000);
  });

  it("stops the public link resolving once the document is voided", async () => {
    const doc = await mod.createDocument(ctxA, { contactId: contactA, items: lines });
    const token = doc!.publicToken;

    expect(await mod.getDocumentByPublicToken(token)).not.toBeNull();

    await mod.voidDocument(ctxA, doc!.id, "makulerad");
    expect(await mod.getDocumentByPublicToken(token)).toBeNull();
  });

  it("shows up on the contact's timeline, issued date first", async () => {
    // The timeline is what a rep reads on the contact record; 1Q shipped
    // after it and was invisible there until documents were added as a
    // fifth source.
    const { getContactTimeline } = await import("@/modules/crm/timeline");
    const { createContact } = await import("@/modules/crm/contacts");

    const contact = await createContact(ctxA, {
      name: "Cliente Timeline",
      phone: `+4670${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
    });
    const document = await mod.createDocument(ctxA, {
      contactId: contact!.id,
      items: lines,
    });
    await mod.issueDocument(ctxA, document!.id);

    const entry = (await getContactTimeline(ctxA, contact!.id)).find(
      (candidate) => candidate.kind === "document",
    );
    expect(entry).toMatchObject({
      id: document!.id,
      number: document!.number,
      status: "issued",
      total: 2_500_000,
    });

    const issued = await mod.getDocument(ctxA, document!.id);
    expect(entry!.at.getTime()).toBe(issued!.issuedAt!.getTime());
  });

  it("isolates documents, items and payments across tenants", async () => {
    const doc = await mod.createDocument(ctxA, { contactId: contactA, items: lines });
    await mod.issueDocument(ctxA, doc!.id);
    await mod.recordPayment(ctxA, doc!.id, { amount: 1000 });

    // B cannot read A's document by id, nor its lines or ledger.
    expect(await mod.getDocument(ctxB, doc!.id)).toBeNull();
    expect(await mod.listDocumentItems(ctxB, doc!.id)).toEqual([]);
    expect(await mod.listPayments(ctxB, doc!.id)).toEqual([]);
    expect(await mod.amountPaid(ctxB, doc!.id)).toBe(0);
    expect((await mod.listDocuments(ctxB)).some((row) => row.id === doc!.id)).toBe(false);

    // Nor mutate it: a cross-tenant write matches no rows rather than
    // silently succeeding.
    await expect(mod.issueDocument(ctxB, doc!.id)).rejects.toThrow();
    await expect(mod.voidDocument(ctxB, doc!.id, "x")).rejects.toThrow();
    await expect(mod.recordPayment(ctxB, doc!.id, { amount: 1 })).rejects.toThrow();

    // A's own view is untouched by any of it.
    const totals = await mod.getDocumentTotals(ctxA, doc!.id);
    expect(totals!.amountPaid).toBe(1000);
  });
});
