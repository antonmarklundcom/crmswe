"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clientIp } from "@/lib/http/client-ip";
import { publicCancel, publicReschedule } from "@/modules/booking/public";

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

export type RescheduleState = { error: string | null };

/**
 * Moving the booking, from the visitor's own link. Reschedule is cancel +
 * create (a chain, not a mutated row), so the booking the visitor ends up
 * with has a *new* manage token — hence the redirect rather than a
 * revalidate: the old token now points at a cancelled booking.
 *
 * The cutoff is the cancellation cutoff, enforced in modules/booking for the
 * same reason cancel is: a visitor who may no longer cancel may no longer
 * move the slot either.
 */
export async function rescheduleBookingAction(
  token: string,
  _state: RescheduleState,
  formData: FormData,
): Promise<RescheduleState> {
  const startsAt = String(formData.get("startsAt") ?? "");
  const outcome = await publicReschedule(token, startsAt, clientIp(await headers()));

  if (!outcome.ok) {
    // A refused reschedule is information, not an error page: the visitor is
    // told the slot went, or that it is too late, and picks again.
    return {
      error:
        outcome.status === 409
          ? "slotTaken"
          : outcome.status === 403
            ? "cutoff"
            : outcome.status === 429
              ? "rateLimited"
              : outcome.error === "same_slot"
                ? "sameSlot"
                : "generic",
    };
  }

  revalidatePath(`/b/g/${token}`);
  redirect(`/b/g/${outcome.data.manageToken}`);
}
