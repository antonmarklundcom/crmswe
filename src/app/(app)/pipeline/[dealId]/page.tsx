import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { getDeal } from "@/modules/crm/deals";
import { getPipeline, listStagesForPipeline } from "@/modules/crm/pipelines";
import { getContact } from "@/modules/crm/contacts";
import { listActivitiesForContact } from "@/modules/crm/activities";
import { listTasksForContact } from "@/modules/crm/tasks";
import { listQuotesForContact } from "@/modules/quotes/quotes";
import { listTenantUsers } from "@/modules/tenancy/users";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { formatDateTime, formatMoney } from "@/lib/i18n/format";
import { CloseDealForms, type CloseLabels } from "./CloseDealForms";
import { assignDealAction, reopenDealAction } from "./actions";

// Deal detail (PLAN.md §13 H8). Everything about one opportunity in one
// place: what it's worth, who owns it, how it got to this stage, and what is
// attached to it — plus the two buttons the board can't offer, won and lost.
export default async function DealPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.deal");
  const tp = await getTranslations("app.pipeline");
  const locale = await getLocale();

  const deal = await getDeal(ctx, dealId);
  if (!deal) notFound();

  const [pipeline, stages, contact, users, tasks, quotes, activities] = await Promise.all([
    getPipeline(ctx, deal.pipelineId),
    listStagesForPipeline(ctx, deal.pipelineId),
    getContact(ctx, deal.contactId),
    listTenantUsers(ctx),
    listTasksForContact(ctx, deal.contactId),
    listQuotesForContact(ctx, deal.contactId),
    listActivitiesForContact(ctx, deal.contactId),
  ]);

  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const stage = stageById.get(deal.stageId);
  const closed = !!stage?.isWon || !!stage?.isLost;
  const openStages = stages.filter((s) => !s.isWon && !s.isLost);

  // Stage history comes off the activity trail, which has recorded every
  // move since §5 — the deal row itself only knows the stage it is in now.
  const stageHistory = activities
    .filter((activity) => activity.dealId === deal.id && activity.type === "stage_change")
    .map((activity) => {
      const payload = (activity.payload ?? {}) as { fromStageId?: string; toStageId?: string };
      return {
        id: activity.id,
        at: activity.createdAt,
        from: payload.fromStageId ? (stageById.get(payload.fromStageId)?.name ?? null) : null,
        to: payload.toStageId ? (stageById.get(payload.toStageId)?.name ?? null) : null,
      };
    });

  const dealTasks = tasks.filter((task) => task.dealId === deal.id);

  const closeLabels: CloseLabels = {
    won: t("markWon"),
    lost: t("markLost"),
    reason: t("reason"),
    reasonPlaceholder: t("reasonPlaceholder"),
    errors: {
      noStage: t("errors.noStage"),
      notFound: t("errors.notFound"),
      invalid: t("errors.invalid"),
      unknown: t("errors.unknown"),
    },
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={deal.title}
        description={`${pipeline?.name ?? ""} · ${stage?.name ?? ""}`}
        action={
          <Link
            href={`/pipeline?pipeline=${deal.pipelineId}`}
            className="text-sm underline underline-offset-4"
          >
            {t("backToBoard")}
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t("value")} value={formatMoney(deal.value, deal.currency, locale)} />
        <Fact label={t("stage")} value={stage?.name ?? "—"} />
        <Fact
          label={t("contact")}
          value={contact?.name ?? "—"}
          href={contact ? `/contacts/${contact.id}` : undefined}
        />
        <Fact
          label={t("stageSince")}
          value={formatDateTime(deal.stageEnteredAt, locale)}
        />
      </section>

      {closed ? (
        <section className="flex flex-col gap-3">
          <p className="rounded-md border bg-muted px-3 py-2 text-sm">
            {stage?.isWon ? t("closedWon") : t("closedLost")}
            {deal.closeReason ? ` · ${deal.closeReason}` : ""}
            {deal.closedAt ? ` · ${formatDateTime(deal.closedAt, locale)}` : ""}
          </p>

          {openStages.length > 0 && (
            <form action={reopenDealAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="dealId" value={deal.id} />
              <select
                name="toStageId"
                defaultValue={openStages[0].id}
                className="rounded-md border px-2 py-1 text-sm"
                aria-label={t("stage")}
              >
                {openStages.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" variant="outline">
                {t("reopen")}
              </Button>
            </form>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("closeTitle")}</h2>
          <CloseDealForms dealId={deal.id} labels={closeLabels} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("assignedTitle")}</h2>
        <form action={assignDealAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="dealId" value={deal.id} />
          <select
            name="userId"
            defaultValue={deal.assignedUserId ?? ""}
            className="rounded-md border px-2 py-1 text-sm"
            aria-label={t("assignedTitle")}
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            {t("assign")}
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("historyTitle")}</h2>
        {stageHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {stageHistory.map((entry) => (
              <li key={entry.id} className="rounded-md border px-3 py-2">
                {entry.from ?? "—"} → {entry.to ?? "—"}
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatDateTime(entry.at, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("quotesTitle")}</h2>
          {quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("quotesEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {quotes.map((quote) => (
                <li key={quote.id} className="rounded-md border px-3 py-2">
                  <Link href={`/quotes/${quote.id}`} className="underline underline-offset-4">
                    {quote.number}
                  </Link>
                  <span className="ml-2 text-muted-foreground">
                    {formatMoney(quote.total, quote.currency, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("tasksTitle")}</h2>
          {dealTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tasksEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {dealTasks.map((task) => (
                <li key={task.id} className="rounded-md border px-3 py-2">
                  {task.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDateTime(task.dueAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        <Link href={`/pipeline?pipeline=${deal.pipelineId}`} className="underline underline-offset-4">
          {tp("title")}
        </Link>
      </p>
    </div>
  );
}

function Fact({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">
        {href ? (
          <Link href={href} className="underline underline-offset-4">
            {value}
          </Link>
        ) : (
          value
        )}
      </p>
    </div>
  );
}
