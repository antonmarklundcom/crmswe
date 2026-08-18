import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/config/cron-secret";
import { listSubscriptionsCrossingExpiryWarning } from "@/modules/tenancy/subscriptions";
import { getTenant } from "@/modules/tenancy/tenants";
import { listUsersForTenant } from "@/modules/tenancy/users";
import { sendEmail } from "@/lib/email";
import { subscriptionExpiryWarningEmail } from "@/lib/email/templates";

// Subscription expiry warnings (PLAN.md §10 1M). Same shape as
// api/cron/tick: a Hostinger cron job pings this daily with the shared
// secret. Deliberately its own endpoint rather than folded into tick's ~2s
// loop — this is a once-a-day concern, not a queue to drain, and a separate
// route means it can be pinged on its own daily schedule independent of
// whatever cadence the job-queue fallback uses.
export async function GET(request: Request) {
  if (!isValidCronSecret(request.headers.get("x-cron-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const crossing = await listSubscriptionsCrossingExpiryWarning();
  let emailsSent = 0;

  for (const subscription of crossing) {
    const tenant = await getTenant(subscription.tenantId);
    if (!tenant) continue;

    // Every admin gets the warning — a tenant can have several, and there is
    // no single "billing contact" field to prefer over the others.
    const users = await listUsersForTenant(subscription.tenantId);
    const admins = users.filter((user) => user.role === "admin" && user.email);

    const { subject, html } = subscriptionExpiryWarningEmail({
      tenantName: tenant.name,
      expiresAt: subscription.expiresAt,
      daysRemaining: subscription.daysRemaining,
    });

    for (const admin of admins) {
      const sent = await sendEmail({ to: admin.email, subject, html });
      if (sent) emailsSent += 1;
    }
  }

  return NextResponse.json({ tenantsWarned: crossing.length, emailsSent });
}
