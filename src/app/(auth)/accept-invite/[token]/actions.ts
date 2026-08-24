"use server";

import { headers } from "next/headers";
import { z } from "zod";
import {
  acceptInvitation,
  acceptInvitationAsExistingUser,
} from "@/modules/auth/invitations";
import { auth } from "@/lib/auth/server";

// Route handlers/server actions validate input and call the module service
// — no business logic here (PLAN.md §2.2).
const inputSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
});

export type AcceptInviteState = { error: string | null; success: boolean };

export async function acceptInviteAction(
  _prevState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const parsed = inputSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "invalid", success: false };
  }

  try {
    await acceptInvitation(parsed.data.token, {
      name: parsed.data.name,
      password: parsed.data.password,
    });
    return { error: null, success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "error", success: false };
  }
}

/**
 * Accepts the invitation for someone who already has an account, using their
 * session as the proof of identity — holding the token is not enough, since
 * anyone forwarded the link would otherwise be able to attach *their* account
 * to the invited address's business.
 */
export async function joinWithExistingAccountAction(
  _prevState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const parsed = z.string().min(1).safeParse(formData.get("token"));
  if (!parsed.success) {
    return { error: "invalid", success: false };
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { error: "not_signed_in", success: false };
  }

  try {
    await acceptInvitationAsExistingUser(parsed.data, {
      id: session.user.id,
      email: session.user.email,
    });
    return { error: null, success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "error", success: false };
  }
}
