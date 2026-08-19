import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import {
  getInvitationByToken,
  markInvitationAccepted,
} from "@/modules/tenancy/invitations";
import { assignUserToTenant } from "@/modules/tenancy/users";
import { writeAuditLog } from "@/modules/tenancy/audit";

// Thrown messages are stable codes, not copy (PLAN.md §13 H5 #4): a
// literal Spanish sentence here is a string the user might see in an
// unknown language, and one nothing can translate. The UI turns these into
// the reader's own language — an action's form state where there is a form,
// the route group's error boundary where there isn't.

// Accept-invite orchestration (PLAN.md §2.2 `(auth)` route group): creates
// the Better Auth user via the public sign-up endpoint (which cannot set
// tenantId/role — those are `input: false` additionalFields, see
// lib/auth/server.ts), then binds tenant + role server-side.

export type AcceptInvitationInput = {
  name: string;
  password: string;
};

export async function acceptInvitation(
  token: string,
  input: AcceptInvitationInput,
): Promise<{ userId: string }> {
  const invitation = await getInvitationByToken(token);
  if (!invitation) throw new Error("invitation_not_found");
  if (invitation.acceptedAt) throw new Error("invitation_used");
  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new Error("invitation_expired");
  }

  const result = await auth.api.signUpEmail({
    body: {
      email: invitation.email,
      password: input.password,
      name: input.name,
    },
    headers: await headers(),
  });

  const userId = result.user.id;

  await assignUserToTenant(
    userId,
    invitation.tenantId,
    invitation.role as "admin" | "agent",
  );
  await markInvitationAccepted(invitation.id);

  await writeAuditLog({
    tenantId: invitation.tenantId,
    actorUserId: userId,
    action: "invitation.accepted",
    entity: "invitation",
    entityId: invitation.id,
  });

  return { userId };
}
