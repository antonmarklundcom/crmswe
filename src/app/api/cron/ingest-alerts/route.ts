import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { isValidCronSecret } from "@/lib/config/cron-secret";
import { getTenant } from "@/modules/tenancy/tenants";
import { listUsersForTenant } from "@/modules/tenancy/users";
import { sendEmail } from "@/lib/email";
import { siteIngestAlertEmail } from "@/lib/email/templates";
import {
  collectIngestAlerts,
  markSiteAlerted,
  clearSiteAlert,
  STALE_AFTER_DAYS,
} from "@/modules/sites/alerts";

// Per-site ingest alerts (PLAN.md §5.2.5). Same shape as
// api/cron/subscription-warnings: a Hostinger cron pings this daily with the
// shared secret. Daily, not hourly — the thing being detected is "this has
// been broken since Tuesday", and a broken client form is not fixed by
// hearing about it four times an hour.
export async function GET(request: Request) {
  if (!isValidCronSecret(request.headers.get("x-cron-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { alerts, recovered } = await collectIngestAlerts(now);

  let emailsSent = 0;

  for (const alert of alerts) {
    const tenant = await getTenant(alert.site.tenantId);
    if (!tenant) continue;

    // Every admin, for the same reason the expiry warning does it: there is
    // no single "who watches the sites" contact.
    const users = await listUsersForTenant(alert.site.tenantId);
    const admins = users.filter((user) => user.role === "admin" && user.email);

    const daysSilent = alert.health.lastSuccessAt
      ? Math.floor((now.getTime() - alert.health.lastSuccessAt.getTime()) / (24 * 60 * 60_000))
      : STALE_AFTER_DAYS;

    const { subject, html } = await siteIngestAlertEmail({
      siteName: alert.site.name,
      kind: alert.kind,
      reason: alert.health.lastErrorReason,
      status: alert.health.lastErrorStatus,
      lastSuccessAt: alert.health.lastSuccessAt,
      daysSilent,
      sitesUrl: `${env.APP_URL}/sites`,
      // The tenant's language, not the platform default: these go to that
      // tenant's own admins (PLAN.md §13 H5 #4).
      locale: tenant.locale,
    });

    for (const admin of admins) {
      const sent = await sendEmail({ to: admin.email, subject, html });
      if (sent) emailsSent += 1;
    }

    // Marked regardless of whether the mail actually left: email is optional
    // by design (lib/email no-ops without RESEND_API_KEY), and re-sending a
    // notification nobody can receive every single day would only fill the
    // logs. The /sites column is the fallback surface either way.
    await markSiteAlerted(alert.site.id, alert.kind);
  }

  for (const candidate of recovered) {
    await clearSiteAlert(candidate.site.id);
  }

  return NextResponse.json({
    alerted: alerts.length,
    recovered: recovered.length,
    emailsSent,
  });
}
