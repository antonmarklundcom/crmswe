"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import { createInvitation, revokeInvitation } from "@/modules/tenancy/invitations";
import { getUserByEmail } from "@/modules/tenancy/users";
import { env } from "@/lib/config/env";

// Tenant team management (PLAN.md §10 1I #2). Route handlers/server actions
// validate and delegate — the invitation itself is created by the tenancy
// module (§2.2).

const inviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "agent"]),
});

export type InviteState = {
  error: string | null;
  /** Accept-invite URL, shown once so the admin can send it by hand — there
   * is no transactional email yet (§10 1L). */
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

    revalidatePath("/users");
    return {
      error: null,
      inviteUrl: `${env.APP_URL}/accept-invite/${invitation.token}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    // Grace/locked tenants are read-only at the write path (§10 1C #1).
    return {
      error: message.includes("not writable") ? "readOnly" : "unknown",
      inviteUrl: null,
    };
  }
}

export async function revokeInvitationAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const id = z.string().min(1).parse(formData.get("invitationId"));
  await revokeInvitation(ctx, id);
  revalidatePath("/users");
}
