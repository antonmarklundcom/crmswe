"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { clientIp } from "@/lib/http/client-ip";
import { publicCancel } from "@/modules/booking/public";

// The visitor cancelling their own booking. The cutoff, the rate limit and
// the token resolution all live in modules/booking/public — this action
// validates nothing on its own, per §2.2's module rule.

export async function cancelBookingAction(token: string): Promise<void> {
  await publicCancel(token, undefined, clientIp(await headers()));
  // The page re-reads the booking and renders the outcome (cancelled, or the
  // cutoff message) rather than this action throwing at the visitor — a
  // refused cancel is information, not an error page.
  revalidatePath(`/b/g/${token}`);
}
