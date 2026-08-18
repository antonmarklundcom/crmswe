"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import { createInvitation, revokeInvitation } from "@/modules/tenancy/invitations";
import {
  getUserByEmail,
  getUserById,
  setTenantUserBanned,
  setTenantUserRole,
} from "@/modules/tenancy/users";
import { writeAuditLog } from "@/modules/tenancy/audit";
import { auth } from "@/lib/auth/server";
import { getTenant } from "@/modules/tenancy/tenants";
import { env } from "@/lib/config/env";
import { sendEmail } from "@/lib/email";
import { invitationEmail } from "@/lib/email/templates";

// Tenant team management (PLAN.md §10 1I #2). Route handlers/server actions
// validate and delegate — the invitation itself is created by the tenancy
// module (§2.2).

const inviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "agent"]),
});

export type InviteState = {
  error: string | null;
  /** Accept-invite URL, shown on screen regardless of whether the email
   * actually sent — RESEND_API_KEY may not be configured, or delivery can
   * fail, and the admin still needs a way to reach the invitee. */
  inviteUrl: string | null;
};

export async function inviteUserAction(
  _prevState: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const ctx = await requireTenantAdmin();

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: "invalid", inviteUrl: null };
  }

  // Better Auth's sign-up gate keys off the invitation, so an email that
  // already has an account can never accept one — say so here rather than
  // minting a token that is guaranteed to fail at the end.
  const existing = await getUserByEmail(parsed.data.email);
  if (existing) {
    return { error: "emailTaken", inviteUrl: null };
  }

  try {
    const invitation = await createInvitation(ctx, parsed.data);
    if (!invitation) return { error: "unknown", inviteUrl: null };

    const inviteUrl = `${env.APP_URL}/accept-invite/${invitation.token}`;

    // Best-effort: sendEmail never throws (§10 1M), and the invite link is
    // always shown on screen too, so a delivery failure here never leaves
    // the admin with no way to reach the invitee.
    const [inviter, tenant] = await Promise.all([getUserById(ctx.userId), getTenant(ctx.tenantId)]);
    if (inviter && tenant) {
      const { subject, html } = invitationEmail({
        tenantName: tenant.name,
        inviterName: inviter.name,
        acceptUrl: inviteUrl,
      });
      await sendEmail({ to: parsed.data.email, subject, html });
    }

    revalidatePath("/users");
    return { error: null, inviteUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    // Grace/locked tenants are read-only at the write path (§10 1C #1).
    return {
      error: message.includes("not writable") ? "readOnly" : "unknown",
      inviteUrl: null,
    };
  }
}

// Hidden-id-only (PLAN.md §10 1R #6): the id comes from the rendered
// pending-invitation list, so there is no user-fillable field for an error
// to sit under — safeParse and a silent return instead of form state, the
// same shape as the issue/send/suspend buttons. The delete is already
// tenant-scoped, so an id from another tenant matches nothing.
export async function revokeInvitationAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = z.string().min(1).safeParse(formData.get("invitationId"));
  if (!parsed.success) return;
  await revokeInvitation(ctx, parsed.data);
  revalidatePath("/users");
}

// --- User lifecycle (PLAN.md §13 H4) ------------------------------------
//
// Same hidden-id-only shape as revokeInvitationAction: every one of these is
// a button in a rendered row, so there is no field for a message to sit
// under. The dangerous case — demoting the last admin — is prevented in the
// UI *and* refused by setTenantUserRole, which is what actually holds.

const userIdSchema = z.object({ userId: z.string().min(1).max(26) });

export async function setUserActiveAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = z
    .object({ userId: z.string().min(1).max(26), active: z.enum(["true", "false"]) })
    .safeParse({ userId: formData.get("userId"), active: formData.get("active") });
  if (!parsed.success) return;

  const active = parsed.data.active === "true";
  const target = await setTenantUserBanned(ctx, parsed.data.userId, !active);

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    impersonatorUserId: ctx.impersonatorUserId,
    action: active ? "user.reactivated" : "user.deactivated",
    entity: "user",
    entityId: target.id,
    payload: { email: target.email },
  });

  revalidatePath("/users");
}

export async function setUserRoleAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = z
    .object({ userId: z.string().min(1).max(26), role: z.enum(["admin", "agent"]) })
    .safeParse({ userId: formData.get("userId"), role: formData.get("role") });
  if (!parsed.success) return;

  const target = await setTenantUserRole(ctx, parsed.data.userId, parsed.data.role);

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    impersonatorUserId: ctx.impersonatorUserId,
    action: "user.role_changed",
    entity: "user",
    entityId: target.id,
    payload: { email: target.email, from: target.role, to: parsed.data.role },
  });

  revalidatePath("/users");
}

/** Admin-triggered password reset: sends the same email the user would get
 * from /forgot-password, for the far more common case where they ask their
 * own admin instead of finding the link. */
export async function sendPasswordResetAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return;

  const target = await getUserById(parsed.data.userId);
  if (!target || target.tenantId !== ctx.tenantId) return;

  // Never throws even if Resend is unconfigured (sendResetPassword uses
  // sendEmail, which logs and returns false) — so the admin always gets the
  // same answer, and never a stack trace.
  await auth.api.requestPasswordReset({
    body: { email: target.email, redirectTo: `${env.APP_URL}/reset-password` },
  });

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    impersonatorUserId: ctx.impersonatorUserId,
    action: "user.password_reset_sent",
    entity: "user",
    entityId: target.id,
    payload: { email: target.email },
  });

  redirect("/users?aviso=reset");
}
