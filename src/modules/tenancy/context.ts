import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { getTenant } from "./tenants";
import { getActiveTenantUser } from "./users";
import { computeAccessStatus, type AccessStatus } from "./subscriptions";

// The single sanctioned source of tenant identity (PLAN.md §3.3, layer 1).
// Resolved from the Better Auth session once per request. Client-supplied
// tenant IDs (query params, form fields, headers) must never be trusted —
// every module service takes a TenantContext, never a raw tenantId string
// from user input.

export type TenantRole = "admin" | "agent";

export type TenantContext = {
  tenantId: string;
  userId: string;
  role: TenantRole;
  /** Real superadmin user id, set only while impersonating this tenant user. */
  impersonatorUserId: string | null;
  /** Subscription/suspension state (PLAN.md §10 1B: "grace → read-only
   * banner → locked"). tenantDb's mutation methods (./db.ts) read this to
   * reject writes for anything but "active" — the single choke point every
   * tenant-owned mutation goes through, so grace/locked tenants are
   * read-only at the write path, not just the UI banner. */
  accessStatus: AccessStatus;
};

export type SuperadminContext = {
  userId: string;
  /** Always null for a genuine superadmin session (you can't impersonate yourself). */
  impersonatorUserId: null;
};

type SessionUser = {
  id: string;
  tenantId?: string | null;
  role?: string | null;
  isSuperadmin?: boolean | null;
};

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Resolves the acting tenant context for the current request, or null if
 * there isn't one (unauthenticated, or a superadmin not impersonating).
 * Server components / server actions / route handlers only.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await getSession();
  if (!session) return null;

  const user = session.user as unknown as SessionUser;
  if (!user.tenantId) return null;
  if (user.role !== "admin" && user.role !== "agent") return null;

  const tenant = await getTenant(user.tenantId);
  if (!tenant) return null;

  // Read the row, don't trust the session copy: a user deactivated (or moved
  // out of this tenant) a second ago is still carrying a valid cookie that
  // says otherwise (PLAN.md §13 H4). Their sessions are revoked at ban time
  // too — this is the belt to that suspenders.
  const row = await getActiveTenantUser(user.id, user.tenantId);
  if (!row) return null;

  const impersonatedBy = (
    session.session as unknown as { impersonatedBy?: string | null }
  ).impersonatedBy;

  return {
    tenantId: user.tenantId,
    userId: user.id,
    role: user.role,
    impersonatorUserId: impersonatedBy ?? null,
    accessStatus: await computeAccessStatus(tenant.id, tenant.status),
  };
}

/**
 * Reconstructs a TenantContext for code paths with no Better Auth session at
 * all — public form submissions (tenant resolved by URL slug, not user
 * input) and, per §3.3, background jobs ("jobs carry tenant_id in their
 * payload and the worker reconstructs a tenant context before calling
 * services"). userId is a fixed sentinel, never a real user row — nothing
 * in tenantDb or the services built on it dereferences it as one. Returns
 * null if the tenant doesn't exist.
 */
export async function buildSystemTenantContext(
  tenantId: string,
): Promise<TenantContext | null> {
  const tenant = await getTenant(tenantId);
  if (!tenant) return null;

  return {
    tenantId,
    userId: "system",
    role: "agent",
    impersonatorUserId: null,
    accessStatus: await computeAccessStatus(tenant.id, tenant.status),
  };
}

export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) {
    throw new Error("No tenant context: not authenticated as a tenant user");
  }
  return ctx;
}

/**
 * Tenant `admin`-only actions (PLAN.md §3.2: WhatsApp connection,
 * automations, users/invites, and — new in 1C — tenant settings; `agent`
 * works contacts/deals/inbox/quotes but doesn't manage tenant config).
 */
export async function requireTenantAdmin(): Promise<TenantContext> {
  const ctx = await requireTenantContext();
  if (ctx.role !== "admin") {
    throw new Error("Se requiere rol de administrador");
  }
  return ctx;
}

/** Resolves the current superadmin identity, or null if not a superadmin. */
export async function getSuperadminContext(): Promise<SuperadminContext | null> {
  const session = await getSession();
  if (!session) return null;

  const user = session.user as unknown as SessionUser;
  if (!user.isSuperadmin) return null;

  return { userId: user.id, impersonatorUserId: null };
}

export async function requireSuperadminContext(): Promise<SuperadminContext> {
  const ctx = await getSuperadminContext();
  if (!ctx) {
    throw new Error("Superadmin required");
  }
  return ctx;
}
