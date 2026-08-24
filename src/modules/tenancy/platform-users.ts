import { asc, like, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { listMembershipsForUser } from "./memberships";
import type { TenantRole } from "./context";

// The platform-wide user list (superadmin only). Every other user query in
// this module is scoped to one business, by design — this one deliberately is
// not, because "who is this person and which businesses can they reach" is a
// question only the platform can answer, and answering it in the console is
// what stops the operator from opening five tenant pages to find out.
//
// Superadmin-only by construction: it reads `db` directly, has no
// TenantContext to scope by, and lives behind requireSuperadminContext in the
// only route that calls it.

export type PlatformUserMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
  banned: boolean;
};

export type PlatformUser = {
  id: string;
  name: string;
  email: string;
  isSuperadmin: boolean;
  /** Platform-level ban — distinct from a membership being deactivated. */
  banned: boolean;
  createdAt: Date;
  /** Which business the switcher last put them in; null for superadmins. */
  activeTenantId: string | null;
  memberships: PlatformUserMembership[];
};

/** How many users one page of the console shows. */
export const PLATFORM_USER_PAGE_SIZE = 100;

export async function listPlatformUsers(
  options: { search?: string; limit?: number } = {},
): Promise<PlatformUser[]> {
  const search = options.search?.trim();
  const filter: SQL | undefined = search
    ? (or(like(users.email, `%${search}%`), like(users.name, `%${search}%`)) as SQL)
    : undefined;

  const rows = await db
    .select()
    .from(users)
    .where(filter)
    .orderBy(asc(users.email))
    .limit(options.limit ?? PLATFORM_USER_PAGE_SIZE);

  // One membership read per user rather than a join: the list is a page of
  // 100 at most, and listMembershipsForUser already returns the tenant beside
  // each membership — reproducing that join here would be a second place for
  // "which businesses can they reach" to drift.
  return Promise.all(
    rows.map(async (row) => {
      const memberships = row.isSuperadmin ? [] : await listMembershipsForUser(row.id);
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        isSuperadmin: row.isSuperadmin,
        banned: row.banned,
        createdAt: row.createdAt,
        activeTenantId: row.tenantId,
        memberships: memberships.map(({ membership, tenant }) => ({
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          role: membership.role,
          banned: membership.banned,
        })),
      };
    }),
  );
}
