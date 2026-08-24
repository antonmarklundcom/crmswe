"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import { writeAuditLog } from "@/modules/tenancy/audit";
import { getUserById } from "@/modules/tenancy/users";
import { addMembership, removeMembership, MembershipError } from "@/modules/tenancy/memberships";

// Connecting and disconnecting people from businesses, from the platform side
// of the console. Same writes the tenant page already offers, reached from
// the other direction: there, you start from a business and add a person;
// here you start from a person and see every business they can reach. The
// operator running several businesses thinks in people, not tenants.
//
// Superadmin-only, and not by omission — adding somebody to a business is the
// cross-tenant write §3.3 exists to keep out of a tenant admin's hands.

export type MembershipActionState = {
  error: string | null;
  ok: boolean;
};

const connectSchema = z.object({
  userId: z.string().min(1).max(26),
  tenantId: z.string().min(1).max(26),
  role: z.enum(["admin", "agent"]),
});

export async function connectUserToTenantAction(
  _prevState: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const superadmin = await requireSuperadminContext();
  const parsed = connectSchema.safeParse({
    userId: formData.get("userId"),
    tenantId: formData.get("tenantId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: "invalid", ok: false };

  const user = await getUserById(parsed.data.userId);
  if (!user) return { error: "userNotFound", ok: false };
  // A superadmin already reaches every business through impersonation. A
  // membership on top would put a platform account inside a tenant's team
  // list, where a tenant admin could deactivate or demote it.
  if (user.isSuperadmin) return { error: "superadminTarget", ok: false };

  try {
    await addMembership({
      userId: parsed.data.userId,
      tenantId: parsed.data.tenantId,
      role: parsed.data.role,
    });
  } catch (err) {
    if (err instanceof MembershipError) return { error: err.code, ok: false };
    throw err;
  }

  await writeAuditLog({
    tenantId: parsed.data.tenantId,
    actorUserId: superadmin.userId,
    action: "membership.added",
    entity: "user",
    entityId: parsed.data.userId,
    payload: { role: parsed.data.role, via: "users-console" },
  });

  revalidatePath("/platform-users");
  revalidatePath(`/tenants/${parsed.data.tenantId}`);
  return { error: null, ok: true };
}

const disconnectSchema = z.object({
  userId: z.string().min(1).max(26),
  tenantId: z.string().min(1).max(26),
});

export async function disconnectUserFromTenantAction(
  _prevState: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const superadmin = await requireSuperadminContext();
  const parsed = disconnectSchema.safeParse({
    userId: formData.get("userId"),
    tenantId: formData.get("tenantId"),
  });
  if (!parsed.success) return { error: "invalid", ok: false };

  try {
    // Refuses to remove the last active admin of a business — the same guard
    // the tenant page enforces, because leaving a business with nobody who
    // can administer it is not a thing the console should let happen from
    // either direction.
    await removeMembership(parsed.data.tenantId, parsed.data.userId);
  } catch (err) {
    if (err instanceof MembershipError) return { error: err.code, ok: false };
    throw err;
  }

  await writeAuditLog({
    tenantId: parsed.data.tenantId,
    actorUserId: superadmin.userId,
    action: "membership.removed",
    entity: "user",
    entityId: parsed.data.userId,
    payload: { via: "users-console" },
  });

  revalidatePath("/platform-users");
  revalidatePath(`/tenants/${parsed.data.tenantId}`);
  return { error: null, ok: true };
}
