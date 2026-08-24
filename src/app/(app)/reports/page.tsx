import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { requireTenantContext } from "@/modules/tenancy/context";
import { getSalesReport, reportWindow } from "@/modules/reports/sales";
import { listTenantUsers } from "@/modules/tenancy/users";
import { listSites } from "@/modules/sites/sites";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, formatNumber } from "@/lib/i18n/format";

// Lead-to-sale reporting for the business (PLAN.md §10 1J). Open to agente as
// well as admin: the pipeline is shared (§1.2), so the numbers over it are
// too, and a rep who cannot see their own conversion rate cannot improve it.
//
// Not web analytics — pageviews and traffic funnels are deliberately not in
// this repo (§1.2). Everything here is something the CRM already owns.

const PERIODS = [30, 90, 365] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.reports");
  const locale = await getLocale();
  const { days: rawDays } = await searchParams;

  const days = PERIODS.includes(Number(rawDays) as (typeof PERIODS)[number])
    ? Number(rawDays)
    : 30;

  const [report, users, sites] = await Promise.all([
    getSalesReport(ctx, reportWindow(days)),
    listTenantUsers(ctx),
    listSites(ctx),
  ]);

  const n = (value: number) => formatNumber(value, locale);
  const userNames = new Map(users.map((user) => [user.id, user.name]));
  const siteNames = new Map(sites.map((site) => [site.id, site.name]));

  const { funnel, response } = report;
  /** Whole percent — a conversion rate to one decimal place implies a
   * precision these sample sizes do not have. */
  const rate = (part: number, whole: number) =>
    whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;

  const funnelSteps = [
    { key: "leads", value: funnel.leads, hint: null },
    {
      key: "dealsOpened",
      value: funnel.dealsOpened,
      hint: rate(funnel.leadsWithDeal, funnel.leads),
    },
    {
      key: "dealsWon",
      value: funnel.dealsWon,
      hint: rate(funnel.dealsWon, funnel.dealsOpened),
    },
    { key: "dealsLost", value: funnel.dealsLost, hint: null },
  ] as const;

  const maxMonth = Math.max(1, ...report.byMonth.map((month) => month.won + month.lost));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("title")}
        description={t("intro")}
        action={
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((period) => (
              <Link
                key={period}
                href={`/reports?days=${period}`}
                className={cn(
                  buttonVariants({ variant: period === days ? "default" : "outline", size: "sm" }),
                )}
              >
                {t("period", { days: period })}
              </Link>
            ))}
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {funnelSteps.map((step) => (
          <Card key={step.key}>
            <span className="text-sm text-muted-foreground">
              {t(`funnel.${step.key}` as "funnel.leads")}
            </span>
            <span className="text-3xl font-semibold tabular-nums">{n(step.value)}</span>
            {step.hint && (
              <span className="text-xs text-muted-foreground">
                {t("conversion", { rate: step.hint })}
              </span>
            )}
          </Card>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <span className="text-sm text-muted-foreground">{t("wonValue")}</span>
          <span className="text-2xl font-semibold tabular-nums">
            {formatMoney(funnel.wonValue, funnel.currency, locale)}
          </span>
        </Card>
        <Card>
          <span className="text-sm text-muted-foreground">{t("responseTitle")}</span>
          <span className="text-2xl font-semibold tabular-nums">
            {response.medianMinutes === null
              ? "—"
              : t("minutes", { count: Math.round(response.medianMinutes) })}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("responseHint", { answered: response.answered, unanswered: response.unanswered })}
          </span>
        </Card>
      </section>

      {report.byMonth.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("byMonthTitle")}</h2>
          <ul className="flex flex-col gap-2">
            {report.byMonth.map((month) => (
              <li key={month.month} className="flex items-center gap-3 text-sm">
                <span className="w-20 tabular-nums text-muted-foreground">{month.month}</span>
                {/* Bars rather than a chart library: two numbers per row do
                    not justify a dependency, and this reads the same in an
                    email screenshot. */}
                <span className="flex h-4 flex-1 overflow-hidden rounded-sm bg-muted">
                  <span
                    className="bg-success"
                    style={{ width: `${(month.won / maxMonth) * 100}%` }}
                  />
                  <span
                    className="bg-destructive/60"
                    style={{ width: `${(month.lost / maxMonth) * 100}%` }}
                  />
                </span>
                <span className="w-32 text-right tabular-nums">
                  {t("wonLost", { won: month.won, lost: month.lost })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("bySourceTitle")}</h2>
          <SourceTable
            rows={report.bySource}
            labels={{
              key: t("table.source"),
              leads: t("table.leads"),
              deals: t("table.deals"),
              won: t("table.won"),
              empty: t("table.empty"),
            }}
            format={n}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("bySiteTitle")}</h2>
          <SourceTable
            rows={report.bySite.map((row) => ({
              ...row,
              key: siteNames.get(row.key) ?? row.key,
            }))}
            labels={{
              key: t("table.site"),
              leads: t("table.leads"),
              deals: t("table.deals"),
              won: t("table.won"),
              empty: t("table.empty"),
            }}
            format={n}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("byAgentTitle")}</h2>
        {report.byAgent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("table.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 font-medium">{t("table.agent")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("table.won")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("table.wonValue")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("table.open")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("table.messages")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("table.tasks")}</th>
                </tr>
              </thead>
              <tbody>
                {report.byAgent.map((agent) => (
                  <tr key={agent.userId} className="border-b">
                    <td className="py-2 pr-4">{userNames.get(agent.userId) ?? agent.userId}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(agent.dealsWon)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(agent.wonValue, funnel.currency, locale)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(agent.dealsOpen)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(agent.messagesSent)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(agent.tasksCompleted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SourceTable({
  rows,
  labels,
  format,
}: {
  rows: Array<{ key: string; leads: number; deals: number; won: number }>;
  labels: { key: string; leads: string; deals: string; won: string; empty: string };
  format: (value: number) => string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{labels.empty}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-4 font-medium">{labels.key}</th>
            <th className="px-3 py-2 text-right font-medium">{labels.leads}</th>
            <th className="px-3 py-2 text-right font-medium">{labels.deals}</th>
            <th className="px-3 py-2 text-right font-medium">{labels.won}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b">
              <td className="py-2 pr-4">{row.key}</td>
              <td className="px-3 py-2 text-right tabular-nums">{format(row.leads)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{format(row.deals)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{format(row.won)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
