import { afterAll, beforeAll, describe, expect, it } from "vitest";

// CSV round trip and the row-level import report are database behavior
// (matching existing catalog rows by name, writing new/updated rows), so
// this suite needs a real MySQL — same skip pattern as
// modules/crm/import.integration.test.ts.
const hasDb = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!hasDb) return;
  const { db } = await import("@/db/client");
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
});

describe.skipIf(!hasDb)("product CSV import/export (MySQL integration)", () => {
  let newId: (typeof import("@/lib/ids"))["newId"];
  let createTenant: (typeof import("@/modules/tenancy/tenants"))["createTenant"];
  let createProduct: (typeof import("./products"))["createProduct"];
  let listProducts: (typeof import("./products"))["listProducts"];
  let exportProductsCsv: (typeof import("./products-csv"))["exportProductsCsv"];
  let importProducts: (typeof import("./products-csv"))["importProducts"];
  let parseCsv: (typeof import("@/modules/crm/import"))["parseCsv"];

  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  async function makeCtx(name: string): Promise<TenantContext> {
    const tenant = await createTenant(
      { userId: "sa-products-csv", impersonatorUserId: null },
      { name: `${name} ${newId()}`, slug: `pcsv-${newId()}` },
    );
    return {
      tenantId: tenant!.id,
      userId: "system",
      role: "admin",
      impersonatorUserId: null,
      accessStatus: "active",
      currency: "SEK",
    };
  }

  beforeAll(async () => {
    ({ newId } = await import("@/lib/ids"));
    ({ createTenant } = await import("@/modules/tenancy/tenants"));
    ({ createProduct, listProducts } = await import("./products"));
    ({ exportProductsCsv, importProducts } = await import("./products-csv"));
    ({ parseCsv } = await import("@/modules/crm/import"));
  });

  it("exports the catalog, including inactive products, as CSV", async () => {
    const ctx = await makeCtx("Export");
    // 500 000 öre — 5 000,00 kr — which the export must write in kronor.
    await createProduct(ctx, { name: "Konsultation", unitPrice: 500000 });
    const inactive = await createProduct(ctx, { name: "Gammal", unitPrice: 1000 });
    await (await import("./products")).updateProduct(ctx, inactive!.id, { isActive: false });

    const csv = await exportProductsCsv(ctx);
    const { headers, rows } = parseCsv(csv);

    expect(headers).toEqual(["name", "description", "unit_price", "currency", "is_active"]);
    expect(rows).toHaveLength(2);
    const konsultation = rows.find((r) => r.name === "Konsultation");
    expect(konsultation).toMatchObject({
      unit_price: "5000.00",
      currency: "SEK",
      is_active: "true",
    });
    const gammal = rows.find((r) => r.name === "Gammal");
    expect(gammal).toMatchObject({ unit_price: "10.00", is_active: "false" });
  });

  it("round-trips an exported file without moving the decimal point", async () => {
    // The failure this exists for: an export that wrote öre and an import that
    // read kronor would multiply every price by 100 on the first round trip.
    const source = await makeCtx("RoundTripSource");
    await createProduct(source, { name: "Servicebesök", unitPrice: 149550 });
    await createProduct(source, { name: "Reservdel", unitPrice: 5 });
    const csv = await exportProductsCsv(source);

    const target = await makeCtx("RoundTripTarget");
    const { rows } = parseCsv(csv);
    const report = await importProducts(target, rows);
    expect(report.errors).toEqual([]);

    const imported = await listProducts(target, true);
    expect(imported.map((r) => [r.name, r.unitPrice])).toEqual([
      ["Reservdel", 5],
      ["Servicebesök", 149550],
    ]);
  });

  it("creates new products and updates existing ones matched by name (case-insensitive)", async () => {
    const ctx = await makeCtx("Import");
    const existing = await createProduct(ctx, { name: "Installation", unitPrice: 100 });

    const report = await importProducts(ctx, [
      // Matches the existing product by a case-insensitive name — updates it.
      // The price is written the Swedish way, as a person would type it.
      {
        name: "installation",
        description: "Uppdaterad",
        unit_price: "1 500,50",
        currency: "sek",
        is_active: "true",
      },
      // Brand new product, machine form.
      { name: "Underhåll", description: "", unit_price: "800.00", currency: "SEK", is_active: "false" },
    ]);

    expect(report.total).toBe(2);
    expect(report.created).toBe(1);
    expect(report.updated).toBe(1);
    expect(report.errors).toEqual([]);

    const rows = await listProducts(ctx, true);
    const updated = rows.find((r) => r.id === existing!.id);
    // 1 500,50 kr is 150 050 öre — not 1 500.
    expect(updated).toMatchObject({
      unitPrice: 150050,
      currency: "SEK",
      description: "Uppdaterad",
    });

    const created = rows.find((r) => r.name === "Underhåll");
    expect(created).toMatchObject({ unitPrice: 80000, isActive: false });
  });

  it("reports row-level errors without failing the whole file", async () => {
    const ctx = await makeCtx("PartialFail");

    const report = await importProducts(ctx, [
      { name: "Bra", unit_price: "1000", currency: "SEK", is_active: "true" },
      { name: "", unit_price: "1000", currency: "SEK" },
      { name: "Dåligt pris", unit_price: "inte-ett-tal", currency: "SEK" },
      { name: "Dålig valuta", unit_price: "1000", currency: "KR" },
      { name: "Upprepad", unit_price: "1000", currency: "SEK" },
      { name: "Upprepad", unit_price: "2000", currency: "SEK" },
    ]);

    expect(report.total).toBe(6);
    expect(report.created).toBe(2); // "Bra" and the first "Upprepad"
    expect(report.updated).toBe(0);

    const reasons = report.errors.map((e) => e.reason).sort();
    expect(reasons).toEqual(["currencyInvalid", "duplicateInFile", "nameMissing", "unitPriceInvalid"]);

    // Row numbers are 1-based as the user sees them, header included.
    const nameMissing = report.errors.find((e) => e.reason === "nameMissing");
    expect(nameMissing?.row).toBe(3);
  });

  it("keeps imports isolated per tenant", async () => {
    const ctxA = await makeCtx("TenantA");
    const ctxB = await makeCtx("TenantB");

    await importProducts(ctxA, [{ name: "Bara A", unit_price: "1000", currency: "SEK" }]);
    await importProducts(ctxB, [{ name: "Bara B", unit_price: "2000", currency: "SEK" }]);

    const rowsA = await listProducts(ctxA, true);
    const rowsB = await listProducts(ctxB, true);

    expect(rowsA.map((r) => r.name)).toEqual(["Bara A"]);
    expect(rowsB.map((r) => r.name)).toEqual(["Bara B"]);
  });
});
