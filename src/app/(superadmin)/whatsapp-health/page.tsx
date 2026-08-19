import { getTranslations } from "next-intl/server";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import {
  listAccountHealth,
  listFailedWebhookEvents,
  listDeadWhatsappJobs,
} from "@/modules/whatsapp/health";
import { listDeadJobs, listStuckJobs, type OpsJob } from "@/lib/queue/ops";
import { Button } from "@/components/ui/button";
import { retryJobAction } from "./actions";
import { formatDateTime } from "@/lib/i18n/format";
import { getLocale } from "next-intl/server";

export default async function WhatsappHealthPage() {
  const ctx = await requireSuperadminContext();
  const t = await getTranslations("superadmin.whatsappHealth");
  const locale = await getLocale();

  const [accounts, failedEvents, deadJobs, queueDead, queueStuck] = await Promise.all([
    listAccountHealth(ctx),
    listFailedWebhookEvents(ctx),
    listDeadWhatsappJobs(ctx),
    listDeadJobs(),
    listStuckJobs(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold">{t("title")}</h1>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">{t("tenant")}</th>
                <th className="py-2">{t("number")}</th>
                <th className="py-2">{t("status")}</th>
                <th className="py-2">{t("quality")}</th>
                <th className="py-2">{t("connectedVia")}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b">
                  <td className="py-2">{account.tenantName}</td>
                  <td className="py-2">{account.displayNumber || account.phoneNumberId}</td>
                  <td className={`py-2 ${account.status === "error" ? "text-red-600" : ""}`}>
                    {account.status}
                  </td>
                  <td className="py-2">{account.qualityRating ?? "—"}</td>
                  <td className="py-2">{account.connectedVia}</td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    {t("noAccounts")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("failedWebhooks")}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {failedEvents.map((event) => (
            <li key={event.id} className="rounded-md border px-3 py-2">
              <p className="font-medium">{event.phoneNumberId ?? "—"}</p>
              <p className="text-muted-foreground">{event.error}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(event.createdAt, locale)}
              </p>
            </li>
          ))}
          {failedEvents.length === 0 && (
            <li className="text-muted-foreground">{t("noFailures")}</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("deadJobs")}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {deadJobs.map((job) => (
            <li key={job.id} className="rounded-md border px-3 py-2">
              <p className="font-medium">
                {job.type} <span className="text-muted-foreground">({job.attempts})</span>
              </p>
              <p className="text-muted-foreground">{job.lastError}</p>
            </li>
          ))}
          {deadJobs.length === 0 && <li className="text-muted-foreground">{t("noDeadJobs")}</li>}
        </ul>
      </section>

      {/* Platform-wide queue, not just WhatsApp: a job that dies or hangs is
          work the tenant asked for and never got, and until now nothing in
          the product showed it (PLAN.md §13 H3 #3). */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("queueDead")}</h2>
        <JobList jobs={queueDead} empty={t("noQueueDead")} retryLabel={t("retryJob")} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">{t("queueStuck")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t("queueStuckIntro")}</p>
        <JobList jobs={queueStuck} empty={t("noQueueStuck")} retryLabel={t("retryJob")} />
      </section>
    </div>
  );
}

function JobList({
  jobs,
  empty,
  retryLabel,
}: {
  jobs: OpsJob[];
  empty: string;
  retryLabel: string;
}) {
  if (jobs.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {jobs.map((job) => (
        <li
          key={job.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-md border px-3 py-2"
        >
          <div className="min-w-0">
            <p className="font-medium">
              {job.type}{" "}
              <span className="text-muted-foreground">
                ({job.attempts}/{job.maxAttempts})
              </span>
            </p>
            <p className="break-words text-muted-foreground">{job.lastError ?? "—"}</p>
            <p className="text-xs text-muted-foreground">
              {(job.lockedAt ?? job.runAt).toLocaleString("es-PY")}
              {job.tenantId ? ` · ${job.tenantId}` : ""}
            </p>
          </div>
          <form action={retryJobAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <Button type="submit" size="sm" variant="outline">
              {retryLabel}
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
