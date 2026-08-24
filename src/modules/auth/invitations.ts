import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import {
  getInvitationByToken,
  markInvitationAccepted,
} from "@/modules/tenancy/invitations";
import { assignUserToTenant, getUserByEmail } from "@/modules/tenancy/users";
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

/**
 * Accepts an invitation for someone who does not have an account yet: signs
 * them up, then grants the membership.
 *
 * An invited email that *already* has an account takes the other door —
 * `acceptInvitationAsExistingUser` below. It must not come through here: this
 * path sets a password from an emailed link, which for an existing account
 * would be account takeover by anyone holding the invite token.
 */
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

  if (await getUserByEmail(invitation.email)) {
    throw new Error("invitation_requires_login");
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

/**
 * Accepts an invitation for an email that already has an account — the case
 * that used to be impossible, when one email could belong to exactly one
 * business (PLAN.md §3.1, reopened).
 *
 * The signed-in user must *be* the invited address. Proving it by session
 * rather than by holding the token is the point: the token says "this address
 * was invited", it does not say "whoever opens this link is that address".
 * Nothing here touches their name or password — they already have both.
 */
export async function acceptInvitationAsExistingUser(
  token: string,
  currentUser: { id: string; email: string },
): Promise<{ userId: string; tenantId: string }> {
  const invitation = await getInvitationByToken(token);
  if (!invitation) throw new Error("invitation_not_found");
  if (invitation.acceptedAt) throw new Error("invitation_used");
  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new Error("invitation_expired");
  }

  if (currentUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new Error("invitation_wrong_account");
  }

  await assignUserToTenant(
    currentUser.id,
    invitation.tenantId,
    invitation.role as "admin" | "agent",
  );
  await markInvitationAccepted(invitation.id);

  await writeAuditLog({
    tenantId: invitation.tenantId,
    actorUserId: currentUser.id,
    action: "invitation.accepted",
    entity: "invitation",
    entityId: invitation.id,
  });

  return { userId: currentUser.id, tenantId: invitation.tenantId };
}
