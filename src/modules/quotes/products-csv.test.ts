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
    await createProduct(ctx, { name: "Consultoría", unitPrice: 500000, currency: "PYG" });
    const inactive = await createProduct(ctx, { name: "Viejo", unitPrice: 1000 });
    await (await import("./products")).updateProduct(ctx, inactive!.id, { isActive: false });

    const csv = await exportProductsCsv(ctx);
    const { headers, rows } = parseCsv(csv);

    expect(headers).toEqual(["name", "description", "unit_price", "currency", "is_active"]);
    expect(rows).toHaveLength(2);
    const consultoria = rows.find((r) => r.name === "Consultoría");
    expect(consultoria).toMatchObject({ unit_price: "500000", currency: "PYG", is_active: "true" });
    const viejo = rows.find((r) => r.name === "Viejo");
    expect(viejo).toMatchObject({ is_active: "false" });
  });

  it("creates new products and updates existing ones matched by name (case-insensitive)", async () => {
    const ctx = await makeCtx("Import");
    const existing = await createProduct(ctx, {
      name: "Instalación",
      unitPrice: 100,
      currency: "PYG",
    });

    const report = await importProducts(ctx, [
      // Matches the existing product by a case-insensitive name — updates it.
      { name: "instalación", description: "Actualizado", unit_price: "150000", currency: "pyg", is_active: "true" },
      // Brand new product.
      { name: "Mantenimiento", description: "", unit_price: "80000", currency: "PYG", is_active: "false" },
    ]);

    expect(report.total).toBe(2);
    expect(report.created).toBe(1);
    expect(report.updated).toBe(1);
    expect(report.errors).toEqual([]);

    const rows = await listProducts(ctx, true);
    const updated = rows.find((r) => r.id === existing!.id);
    expect(updated).toMatchObject({ unitPrice: 150000, currency: "PYG", description: "Actualizado" });

    const created = rows.find((r) => r.name === "Mantenimiento");
    expect(created).toMatchObject({ unitPrice: 80000, isActive: false });
  });

  it("reports row-level errors without failing the whole file", async () => {
    const ctx = await makeCtx("PartialFail");

    const report = await importProducts(ctx, [
      { name: "Bueno", unit_price: "1000", currency: "PYG", is_active: "true" },
      { name: "", unit_price: "1000", currency: "PYG" },
      { name: "Precio malo", unit_price: "no-es-numero", currency: "PYG" },
      { name: "Moneda mala", unit_price: "1000", currency: "GS" },
      { name: "Repetido", unit_price: "1000", currency: "PYG" },
      { name: "Repetido", unit_price: "2000", currency: "PYG" },
    ]);

    expect(report.total).toBe(6);
    expect(report.created).toBe(2); // "Bueno" and the first "Repetido"
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

    await importProducts(ctxA, [{ name: "Solo A", unit_price: "1000", currency: "PYG" }]);
    await importProducts(ctxB, [{ name: "Solo B", unit_price: "2000", currency: "PYG" }]);

    const rowsA = await listProducts(ctxA, true);
    const rowsB = await listProducts(ctxB, true);

    expect(rowsA.map((r) => r.name)).toEqual(["Solo A"]);
    expect(rowsB.map((r) => r.name)).toEqual(["Solo B"]);
  });
});
