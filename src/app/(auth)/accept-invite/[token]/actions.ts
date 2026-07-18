"use server";

import { z } from "zod";
import { acceptInvitation } from "@/modules/auth/invitations";

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
