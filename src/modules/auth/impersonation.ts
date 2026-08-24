import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import { writeAuditLog } from "@/modules/tenancy/audit";
import { getUserById } from "@/modules/tenancy/users";
import { getActiveMembership, setActiveTenant } from "@/modules/tenancy/memberships";

// "Ver como" — impersonation entry point (PLAN.md §3.2, §10 1B exit
// criteria). Delegates the session swap to Better Auth's admin plugin, then
// logs the action with both the real (impersonator) and effective user, per
// the plan's audit requirement.

/**
 * @param tenantId Which business to impersonate them *in*. Since one person
 *   can work in several (PLAN.md §3.1), "ver como" is ambiguous without it:
 *   the session would land in whatever business they happened to be in last,
 *   which — clicked from tenant B's console — could well be tenant A. The
 *   caller passes the business whose page the button was on.
 */
export async function startImpersonation(
  targetUserId: string,
  tenantId?: string,
): Promise<void> {
  const ctx = await requireSuperadminContext();

  const target = await getUserById(targetUserId);
  if (!target) throw new Error(`User ${targetUserId} not found`);
  if (target.isSuperadmin) {
    throw new Error("Cannot impersonate another superadmin");
  }

  let actingTenantId = target.tenantId;
  if (tenantId) {
    // Only into a business they can actually work in — impersonation shows
    // what *they* see, so it must not manufacture access they do not have.
    const membership = await getActiveMembership(targetUserId, tenantId);
    if (!membership) throw new Error(`User ${targetUserId} is not a member of ${tenantId}`);
    // Their active-business pointer is where the session reads the business
    // from, so it has to move. It stays moved after the superadmin stops
    // impersonating — the user simply finds themselves in a business they
    // are a member of, and one click on the switcher puts them back.
    await setActiveTenant(targetUserId, tenantId);
    actingTenantId = tenantId;
  }

  await auth.api.impersonateUser({
    headers: await headers(),
    body: { userId: targetUserId },
  });

  await writeAuditLog({
    tenantId: actingTenantId,
    actorUserId: targetUserId,
    impersonatorUserId: ctx.userId,
    action: "impersonation.started",
    entity: "user",
    entityId: targetUserId,
    payload: { targetEmail: target.email },
  });
}

export async function stopImpersonation(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  const impersonatorUserId = (
    session?.session as unknown as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy;
  const effectiveUserId = session?.user.id;

  await auth.api.stopImpersonating({ headers: await headers() });

  if (impersonatorUserId && effectiveUserId) {
    await writeAuditLog({
      actorUserId: effectiveUserId,
      impersonatorUserId,
      action: "impersonation.stopped",
      entity: "user",
      entityId: effectiveUserId,
    });
  }
}
