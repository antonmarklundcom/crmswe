import { and, count, eq, ne } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/db/client";
import { accounts, sessions, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "./context";
import { tenantDb } from "./db";

// User-tenant binding (PLAN.md §3.2). Assigning a user to a tenant/role is
// inherently cross-cutting (it's what *creates* the tenant boundary for that
// user), so it lives here in the tenancy module rather than behind
// tenantDb — everything else that touches `users` should go through
// tenantDb(ctx) so it can never read/write another tenant's users.

export async function assignUserToTenant(
  userId: string,
  tenantId: string,
  role: "admin" | "agent",
) {
  await db.update(users).set({ tenantId, role }).where(eq(users.id, userId));
}

/**
 * Superadmin bootstrap (PLAN.md §10 1C follow-up #2, scripts/create-superadmin.ts):
 * inserts a user + credential account directly, the same shape Better
 * Auth's own email/password sign-up would produce. Only entry point for the
 * very first superadmin — sign-up itself is gated to invited emails, and
 * invitations can only be created by an existing admin/superadmin.
 */
export async function createSuperadminUser(input: {
  email: string;
  password: string;
  name: string;
}) {
  const userId = newId();

  await db.insert(users).values({
    id: userId,
    email: input.email,
    emailVerified: true,
    name: input.name,
    role: "superadmin",
    isSuperadmin: true,
    tenantId: null,
  });

  await db.insert(accounts).values({
    id: newId(),
    userId,
    accountId: userId,
    providerId: "credential",
    password: await hashPassword(input.password),
  });

  return getUserById(userId);
}

/**
 * Owner tenant bootstrap (PLAN.md §10 1H #1, scripts/seed-tenant.ts):
 * creates the admin user for a brand-new tenant the same way
 * createSuperadminUser does for the platform — inserts a user + credential
 * account directly, since there's no admin session yet to invite them
 * through the normal flow.
 */
export async function createTenantAdminUser(input: {
  tenantId: string;
  email: string;
  password: string;
  name: string;
  /** Defaults to `admin` — the bootstrap case the seed script needs. 1I's
   * superadmin console passes `agent` when standing up a whole team. */
  role?: "admin" | "agent";
}) {
  const userId = newId();

  await db.insert(users).values({
    id: userId,
    tenantId: input.tenantId,
    email: input.email,
    emailVerified: true,
    name: input.name,
    role: input.role ?? "admin",
    isSuperadmin: false,
  });

  await db.insert(accounts).values({
    id: newId(),
    userId,
    accountId: userId,
    providerId: "credential",
    password: await hashPassword(input.password),
  });

  return getUserById(userId);
}

/** Resets a user's credential password in place — used by the idempotent
 * seed script when the user row already exists. */
export async function setUserPassword(userId: string, password: string) {
  await db
    .update(accounts)
    .set({ password: await hashPassword(password) })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
}

export async function getUserByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email));
  return row ?? null;
}

export async function markSuperadmin(userId: string) {
  await db
    .update(users)
    .set({ isSuperadmin: true, role: "superadmin", tenantId: null })
    .where(eq(users.id, userId));
}

export async function getUserById(userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row ?? null;
}

/** Tenant-scoped: list users belonging to the caller's own tenant. */
export function listTenantUsers(ctx: TenantContext) {
  return tenantDb(ctx).select(users);
}

/**
 * Superadmin-only: list a given tenant's users, for the impersonation
 * ("ver como") picker in the superadmin console. Deliberately bypasses
 * tenantDb (the caller has no TenantContext of their own — that's the
 * point of superadmin) so this stays confined to the tenancy module.
 */
export async function listUsersForTenant(tenantId: string) {
  return db.select().from(users).where(eq(users.tenantId, tenantId));
}


// --- User lifecycle (PLAN.md §13 H4) ------------------------------------
//
// The `banned` columns have existed since the Better Auth schema landed and
// were referenced nowhere: there was no way to take a leaving salesperson's
// access away short of deleting the row (which would orphan their deals) or
// changing their password. Deactivation is that missing door, and it has to
// close *now*, not at session expiry — hence the session sweep below.

export class UserLifecycleError extends Error {
  constructor(readonly code: "notFound" | "self" | "lastAdmin") {
    super(code);
  }
}

/** The user row behind a session, or null if it can no longer act: deleted,
 * moved to another tenant, or deactivated. getTenantContext calls this on
 * every request, which is what makes a ban take effect immediately. */
export async function getActiveTenantUser(userId: string, tenantId: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

  if (!row || row.banned) return null;
  return row;
}

/** Drops every session row for a user — the ban is worthless if the cookie
 * they already hold keeps working until it expires. */
export async function revokeUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

async function requireSameTenantUser(ctx: TenantContext, userId: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, ctx.tenantId)));

  if (!row) throw new UserLifecycleError("notFound");
  if (row.id === ctx.userId) throw new UserLifecycleError("self");
  return row;
}

/** Deactivates or reactivates a member of the caller's own tenant. */
export async function setTenantUserBanned(
  ctx: TenantContext,
  userId: string,
  banned: boolean,
  reason?: string,
) {
  const target = await requireSameTenantUser(ctx, userId);

  // An admin deactivating the last other admin is fine; deactivating
  // *themselves* is what the self guard above already refuses.
  await db
    .update(users)
    .set({
      banned,
      banReason: banned ? (reason?.slice(0, 500) ?? null) : null,
      banExpires: null,
    })
    .where(eq(users.id, userId));

  if (banned) await revokeUserSessions(userId);

  return target;
}

export async function countTenantAdmins(tenantId: string, excludingUserId?: string) {
  const [row] = await db
    .select({ value: count() })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.role, "admin"),
        eq(users.banned, false),
        excludingUserId ? ne(users.id, excludingUserId) : undefined,
      ),
    );
  return row?.value ?? 0;
}

/**
 * Promotes or demotes a member of the caller's own tenant. Refuses to leave
 * the tenant with no active admin — that state can only be repaired by a
 * superadmin, so it must not be reachable by a single click.
 */
export async function setTenantUserRole(
  ctx: TenantContext,
  userId: string,
  role: "admin" | "agent",
) {
  const target = await requireSameTenantUser(ctx, userId);

  if (target.role === "admin" && role === "agent") {
    const remaining = await countTenantAdmins(ctx.tenantId, userId);
    if (remaining === 0) throw new UserLifecycleError("lastAdmin");
  }

  await db.update(users).set({ role }).where(eq(users.id, userId));
  return target;
}
