import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";

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

  const impersonatedBy = (
    session.session as unknown as { impersonatedBy?: string | null }
  ).impersonatedBy;

  return {
    tenantId: user.tenantId,
    userId: user.id,
    role: user.role,
    impersonatorUserId: impersonatedBy ?? null,
  };
}

export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) {
    throw new Error("No tenant context: not authenticated as a tenant user");
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
