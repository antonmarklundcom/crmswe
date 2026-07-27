import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeTotals } from "./quotes";

// computeTotals is pure, so it runs everywhere; everything else needs a real
// MySQL (transactional numbering can't be faked) and follows the same
// hasDb convention as the other suites.
const hasDb = !!process.env.DATABASE_URL;

describe("computeTotals", () => {
  it("multiplies qty by unit price and sums the lines", () => {
    const result = computeTotals(
      [
        { description: "a", qty: 2, unitPrice: 150000 },
        { description: "b", qty: 3, unitPrice: 50000 },
      ],
      0,
    );
    expect(result.subtotal).toBe(450000);
    expect(result.total).toBe(450000);
  });

  it("applies a discount", () => {
    const result = computeTotals([{ description: "a", qty: 1, unitPrice: 100000 }], 25000);
    expect(result.total).toBe(75000);
  });

  it("never lets a discount push the total negative", () => {
    const result = computeTotals([{ description: "a", qty: 1, unitPrice: 10000 }], 999999);
    expect(result.discount).toBe(10000);
    expect(result.total).toBe(0);
  });

  it("ignores a negative discount rather than inflating the total", () => {
    const result = computeTotals([{ description: "a", qty: 1, unitPrice: 10000 }], -5000);
    expect(result.total).toBe(10000);
  });
});

describe.skipIf(!hasDb)("quotes (MySQL)", () => {
  let db: (typeof import("@/db/client"))["db"];
  let schema: typeof import("@/db/schema");
  let newId: (typeof import("@/lib/ids"))["newId"];
  let createTenant: (typeof import("@/modules/tenancy/tenants"))["createTenant"];
  let buildSystemTenantContext: (typeof import("@/modules/tenancy/context"))["buildSystemTenantContext"];
  let createContact: (typeof import("@/modules/crm/contacts"))["createContact"];
  let createQuote: (typeof import("./quotes"))["createQuote"];
  let getQuote: (typeof import("./quotes"))["getQuote"];
  let listQuotes: (typeof import("./quotes"))["listQuotes"];
  let listQuoteItems: (typeof import("./quotes"))["listQuoteItems"];
  let getPublicQuote: (typeof import("./quotes"))["getPublicQuote"];
  let nextQuoteNumber: (typeof import("./numbering"))["nextQuoteNumber"];

  type TenantContext = import("@/modules/tenancy/context").TenantContext;
  const superadmin = { userId: "sa-test", impersonatorUserId: null } as const;

  let ctxA: TenantContext;
  let ctxB: TenantContext;
  let contactAId: string;
  let contactBId: string;

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    schema = await import("@/db/schema");
    ({ newId } = await import("@/lib/ids"));
    ({ createTenant } = await import("@/modules/tenancy/tenants"));
    ({ buildSystemTenantContext } = await import("@/modules/tenancy/context"));
    ({ createContact } = await import("@/modules/crm/contacts"));
    ({ createQuote, getQuote, listQuotes, listQuoteItems, getPublicQuote } = await import("./quotes"));
    ({ nextQuoteNumber } = await import("./numbering"));

    const tenantA = await createTenant(superadmin, { name: "Quote A", slug: `quote-a-${newId()}` });
    const tenantB = await createTenant(superadmin, { name: "Quote B", slug: `quote-b-${newId()}` });
    ctxA = (await buildSystemTenantContext(tenantA!.id))!;
    ctxB = (await buildSystemTenantContext(tenantB!.id))!;

    contactAId = (await createContact(ctxA, { name: "Cliente A", phone: `0981${newId().slice(0, 6)}` }))!.id;
    contactBId = (await createContact(ctxB, { name: "Cliente B", phone: `0982${newId().slice(0, 6)}` }))!.id;
  });

  afterAll(async () => {
    if (!db) return;
    const pool = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
    await pool.end();
  });

  it("numbers quotes sequentially per tenant, starting at COT-000001", async () => {
    const first = await createQuote(ctxA, {
      contactId: contactAId,
      items: [{ description: "Implante", qty: 1, unitPrice: 2500000 }],
    });
    const second = await createQuote(ctxA, {
      contactId: contactAId,
      items: [{ description: "Limpieza", qty: 1, unitPrice: 300000 }],
    });

    expect(first!.number).toBe("COT-000001");
    expect(second!.number).toBe("COT-000002");
  });

  it("each tenant has its own sequence — tenant B also starts at 1", async () => {
    const quoteB = await createQuote(ctxB, {
      contactId: contactBId,
      items: [{ description: "Cemento", qty: 10, unitPrice: 45000 }],
    });
    expect(quoteB!.number).toBe("COT-000001");
  });

  it("concurrent quote creation never reuses a number (the reason numbering is transactional)", async () => {
    const before = (await listQuotes(ctxA)).length;

    const numbers = await Promise.all(
      Array.from({ length: 8 }, () => nextQuoteNumber(ctxA)),
    );

    expect(new Set(numbers).size).toBe(numbers.length);
    // Sanity: the burst didn't create quote rows, only consumed numbers.
    expect((await listQuotes(ctxA)).length).toBe(before);
  });

  it("persists line items with computed totals and rejects an empty quote", async () => {
    const quote = await createQuote(ctxA, {
      contactId: contactAId,
      discount: 50000,
      items: [
        { description: "Consulta", qty: 2, unitPrice: 200000 },
        { description: "Radiografía", qty: 1, unitPrice: 100000 },
      ],
    });

    expect(quote!.subtotal).toBe(500000);
    expect(quote!.discount).toBe(50000);
    expect(quote!.total).toBe(450000);

    const items = await listQuoteItems(ctxA, quote!.id);
    expect(items).toHaveLength(2);
    expect(items[0].lineTotal).toBe(400000);

    await expect(createQuote(ctxA, { contactId: contactAId, items: [] })).rejects.toThrow(
      /al menos un ítem/,
    );
  });

  it("quotes are isolated per tenant", async () => {
    const quotesA = await listQuotes(ctxA);
    const quotesB = await listQuotes(ctxB);
    expect(quotesA.some((q) => quotesB.some((b) => b.id === q.id))).toBe(false);

    // Tenant B can't read tenant A's quote even knowing its id.
    expect(await getQuote(ctxB, quotesA[0].id)).toBeNull();
  });

  it("the public token resolves the quote without a session, and a wrong token resolves nothing", async () => {
    const quotesA = await listQuotes(ctxA);
    const [row] = await db
      .select()
      .from(schema.quotes)
      .where(eq(schema.quotes.id, quotesA[0].id));

    const resolved = await getPublicQuote(row.publicToken);
    expect(resolved?.quote.id).toBe(row.id);
    expect(resolved?.items.length).toBeGreaterThan(0);

    expect(await getPublicQuote("not-a-real-token")).toBeNull();
  });
});
