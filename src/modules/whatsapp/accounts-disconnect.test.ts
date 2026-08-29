import { afterAll, beforeAll, describe, expect, it } from "vitest";

// disconnectAccount is what the superadmin console's WhatsApp section calls
// to clear a broken/unwanted connection on a tenant's behalf (PLAN.md §6.2).
// It's plain tenant-scoped DB behavior, so this needs a real MySQL — same
// skip pattern as the other integration suites.
const hasDb = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!hasDb) return;
  const { db } = await import("@/db/client");
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
});

describe.skipIf(!hasDb)("disconnectAccount (MySQL integration)", () => {
  let newId: (typeof import("@/lib/ids"))["newId"];
  let createTenant: (typeof import("@/modules/tenancy/tenants"))["createTenant"];
  let connectAccountManually: (typeof import("./accounts"))["connectAccountManually"];
  let disconnectAccount: (typeof import("./accounts"))["disconnectAccount"];
  let listAccountsForTenant: (typeof import("./accounts"))["listAccountsForTenant"];
  let getPrimaryAccount: (typeof import("./accounts"))["getPrimaryAccount"];

  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  async function makeCtx(name: string): Promise<TenantContext> {
    const tenant = await createTenant(
      { userId: "sa-disconnect", impersonatorUserId: null },
      { name: `${name} ${newId()}`, slug: `disc-${newId()}` },
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
    ({ connectAccountManually, disconnectAccount, listAccountsForTenant, getPrimaryAccount } =
      await import("./accounts"));
  });

  it("flips a connected account to disconnected, leaving the row (and its token columns) intact", async () => {
    const ctx = await makeCtx("Disconnect");
    // phone_number_id is unique platform-wide (webhook routing keys on it,
    // §6.3), so every account in this suite needs its own.
    const account = await connectAccountManually(ctx, {
      wabaId: "waba-1",
      phoneNumberId: `phone-${newId()}`,
      accessToken: "top-secret-token",
    });

    expect(account!.status).toBe("connected");
    expect(await getPrimaryAccount(ctx)).not.toBeNull();

    const disconnected = await disconnectAccount(ctx, account!.id);
    expect(disconnected!.status).toBe("disconnected");

    // The token stays encrypted at rest, untouched — disconnect is a status
    // flip, not a credential wipe (the columns are notNull, §4).
    expect(disconnected!.accessTokenCiphertext).toBe(account!.accessTokenCiphertext);

    // No longer the tenant's usable/primary number.
    expect(await getPrimaryAccount(ctx)).toBeNull();

    const rows = await listAccountsForTenant(ctx);
    expect(rows.map((r) => r.id)).toContain(account!.id);
  });

  it("only touches the named tenant's account", async () => {
    const ctxA = await makeCtx("TenantA");
    const ctxB = await makeCtx("TenantB");

    const accountA = await connectAccountManually(ctxA, {
      wabaId: "waba-a",
      phoneNumberId: `phone-${newId()}`,
      accessToken: "token-a",
    });

    // Tenant B's context can't reach tenant A's account — tenantDb's WHERE
    // tenant_id = ctx.tenantId (§3.3 layer 2) makes this a no-op update.
    await disconnectAccount(ctxB, accountA!.id);

    const rows = await listAccountsForTenant(ctxA);
    expect(rows.find((r) => r.id === accountA!.id)?.status).toBe("connected");
  });
});
