import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import { writeAuditLog } from "@/modules/tenancy/audit";
import { getUserById } from "@/modules/tenancy/users";

// "Ver como" — impersonation entry point (PLAN.md §3.2, §10 1B exit
// criteria). Delegates the session swap to Better Auth's admin plugin, then
// logs the action with both the real (impersonator) and effective user, per
// the plan's audit requirement.

export async function startImpersonation(targetUserId: string): Promise<void> {
  const ctx = await requireSuperadminContext();

  const target = await getUserById(targetUserId);
  if (!target) throw new Error(`User ${targetUserId} not found`);
  if (target.isSuperadmin) {
    throw new Error("Cannot impersonate another superadmin");
  }

  await auth.api.impersonateUser({
    headers: await headers(),
    body: { userId: targetUserId },
  });

  await writeAuditLog({
    tenantId: target.tenantId,
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
