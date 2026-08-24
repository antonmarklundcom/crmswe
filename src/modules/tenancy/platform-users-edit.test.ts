import { describe, expect, it } from "vitest";

// Superadmin edit of a platform user's name/email (PLAN.md §3.1: `users` is
// a platform table, so this is a cross-tenant write — same is_superadmin
// gate as adding/removing a membership). Real MySQL only, same pattern as
// user-lifecycle.test.ts: email uniqueness *is* a DB constraint, so the
// guard has to be proven against the real table.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("updateUserProfile", () => {
  let newId: (typeof import("@/lib/ids"))["newId"];
  let createTenant: (typeof import("./tenants"))["createTenant"];
  let users: typeof import("./users");

  const superadmin: import("./context").SuperadminContext = {
    userId: "sa-profile-edit",
    impersonatorUserId: null,
  };

  it("renames a user and changes their email", async () => {
    ({ newId } = await import("@/lib/ids"));
    ({ createTenant } = await import("./tenants"));
    users = await import("./users");

    const tenant = await createTenant(superadmin, {
      name: `Profile edit ${newId()}`,
      slug: `profile-edit-${newId()}`,
    });
    const user = await users.createTenantAdminUser({
      tenantId: tenant!.id,
      email: `before-${newId()}@example.com`,
      password: "password-1234",
      name: "Before Name",
    });

    const newEmail = `after-${newId()}@example.com`;
    const updated = await users.updateUserProfile(user!.id, {
      name: "After Name",
      email: newEmail,
    });

    expect(updated?.name).toBe("After Name");
    expect(updated?.email).toBe(newEmail);
  });

  it("refuses to reuse another user's email", async () => {
    const tenant = await createTenant(superadmin, {
      name: `Profile edit collide ${newId()}`,
      slug: `profile-edit-collide-${newId()}`,
    });
    const takenEmail = `taken-${newId()}@example.com`;
    await users.createTenantAdminUser({
      tenantId: tenant!.id,
      email: takenEmail,
      password: "password-1234",
      name: "Has The Email",
    });
    const other = await users.createTenantAdminUser({
      tenantId: tenant!.id,
      email: `wants-it-${newId()}@example.com`,
      password: "password-1234",
      name: "Wants It",
    });

    await expect(
      users.updateUserProfile(other!.id, { name: "Wants It", email: takenEmail }),
    ).rejects.toThrow("emailTaken");

    // The refused write didn't partially apply the name either.
    const unchanged = await users.getUserById(other!.id);
    expect(unchanged?.name).toBe("Wants It");
  });

  it("allows re-saving a user's own unchanged email", async () => {
    const tenant = await createTenant(superadmin, {
      name: `Profile edit noop ${newId()}`,
      slug: `profile-edit-noop-${newId()}`,
    });
    const email = `same-${newId()}@example.com`;
    const user = await users.createTenantAdminUser({
      tenantId: tenant!.id,
      email,
      password: "password-1234",
      name: "Original",
    });

    const updated = await users.updateUserProfile(user!.id, { name: "Renamed", email });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.email).toBe(email);
  });
});
