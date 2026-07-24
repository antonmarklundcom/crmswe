import { getTranslations } from "next-intl/server";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import {
  listAccountHealth,
  listFailedWebhookEvents,
  listDeadWhatsappJobs,
} from "@/modules/whatsapp/health";

export default async function WhatsappHealthPage() {
  const ctx = await requireSuperadminContext();
  const t = await getTranslations("superadmin.whatsappHealth");

  const [accounts, failedEvents, deadJobs] = await Promise.all([
    listAccountHealth(ctx),
    listFailedWebhookEvents(ctx),
    listDeadWhatsappJobs(ctx),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold">{t("title")}</h1>
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
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("failedWebhooks")}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {failedEvents.map((event) => (
            <li key={event.id} className="rounded-md border px-3 py-2">
              <p className="font-medium">{event.phoneNumberId ?? "—"}</p>
              <p className="text-muted-foreground">{event.error}</p>
              <p className="text-xs text-muted-foreground">
                {event.createdAt.toLocaleString("es-PY")}
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
    </div>
  );
}
