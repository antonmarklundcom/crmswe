import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  FileText,
  MessagesSquare,
  SquareKanban,
  Users,
  type LucideIcon,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";

import { requireTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import { getDashboardSummary } from "@/modules/dashboard/summary";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { TaskList, type TaskListLabels } from "@/components/task-list";
import { cn } from "@/lib/utils";
import {
  completeTaskAction,
  deleteTaskAction,
  reopenTaskAction,
} from "../contacts/tasks-actions";

// Tenant home. Two jobs: tell someone who already works here what needs
// attention today (the counters), and tell someone who just got their login
// what to do first (the checklist). Every number comes from the tenant-scoped
// read model in modules/dashboard — no raw db, no cross-tenant reads.

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  href: string;
}) {
  return (
    <Card className="gap-3 transition-colors hover:bg-accent/40">
      <Link href={href} className="flex flex-col gap-3">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </span>
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </Link>
    </Card>
  );
}

function ChecklistItem({
  done,
  title,
  description,
  actionLabel,
  href,
}: {
  done: boolean;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
}) {
  const Icon = done ? CircleCheck : CircleDashed;
  return (
    <li className="flex items-start gap-3 border-b py-3 last:border-b-0">
      <Icon
        className={cn("mt-0.5 size-5 shrink-0", done ? "text-primary" : "text-muted-foreground/60")}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>
          {title}
        </span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      {!done && (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 text-sm font-medium whitespace-nowrap underline-offset-4 hover:underline"
        >
          {actionLabel}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </li>
  );
}

export default async function DashboardPage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.dashboard");
  const locale = await getLocale();
  const formatNumberL = (value: number) => formatNumber(value, locale);
  const tActivity = await getTranslations("app.contacts.activityTypes");

  const [tenant, summary] = await Promise.all([
    getTenant(ctx.tenantId),
    getDashboardSummary(ctx),
  ]);

  const { stats, checklist, recentActivity, dueTasks, onboardingPending } = summary;
  const tTasks = await getTranslations("app.contacts.tasks");
  const taskLabels: TaskListLabels = {
    complete: tTasks("complete"),
    reopen: tTasks("reopen"),
    delete: tTasks("delete"),
    overdue: tTasks("overdue"),
  };
  const isAdmin = ctx.role === "admin";

  // Steps an `agent` can't act on (WhatsApp connection, automations — §3.2)
  // are left out of their list rather than shown as a dead end.
  const steps = [
    {
      key: "whatsapp",
      done: checklist.whatsappConnected,
      href: "/whatsapp",
      visible: isAdmin,
    },
    { key: "contact", done: checklist.hasContact, href: "/contacts", visible: true },
    { key: "deal", done: checklist.hasDeal, href: "/pipeline", visible: true },
    { key: "quote", done: checklist.hasQuote, href: "/quotes", visible: true },
    {
      key: "capture",
      done: checklist.hasLeadCapture,
      href: isAdmin ? "/sites" : "/forms",
      visible: true,
    },
    {
      key: "automation",
      done: checklist.hasActiveAutomation,
      href: "/automations",
      visible: isAdmin,
    },
  ].filter((step) => step.visible);

  const doneCount = steps.filter((step) => step.done).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("title", { tenant: tenant?.name ?? "" })}
        description={t("subtitle")}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={SquareKanban}
          label={t("stats.openDeals")}
          value={formatNumberL(stats.openDeals)}
          hint={t("stats.openDealsHint", {
            value: formatNumberL(stats.openDealsValuePyg),
          })}
          href="/pipeline"
        />
        <StatCard
          icon={MessagesSquare}
          label={t("stats.unread")}
          value={formatNumberL(stats.unreadMessages)}
          hint={t("stats.unreadHint", { count: stats.unreadConversations })}
          href="/inbox"
        />
        <StatCard
          icon={FileText}
          label={t("stats.pendingQuotes")}
          value={formatNumberL(stats.pendingQuotes)}
          hint={t("stats.pendingQuotesHint")}
          href="/quotes"
        />
        <StatCard
          icon={Users}
          label={t("stats.contacts")}
          value={formatNumberL(stats.contacts)}
          hint={t("stats.contactsHint")}
          href="/contacts"
        />
      </section>

      {dueTasks.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("dueTasks.title")}</h2>
          <TaskList
            tasks={dueTasks.map((task) => ({
              id: task.id,
              title: task.title,
              dueAt: task.dueAt,
              completed: false,
              contactId: task.contactId,
              contactName: task.contactName,
            }))}
            labels={taskLabels}
            onComplete={completeTaskAction.bind(null, "/dashboard")}
            onReopen={reopenTaskAction.bind(null, "/dashboard")}
            onDelete={deleteTaskAction.bind(null, "/dashboard")}
          />
        </section>
      )}

      {onboardingPending && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("checklist.title")}</h2>
            <span className="text-sm text-muted-foreground">
              {t("checklist.progress", { done: doneCount, total: steps.length })}
            </span>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("checklist.intro")}</p>
          <Card className="py-1">
            <ul className="flex flex-col">
              {steps.map((step) => (
                <ChecklistItem
                  key={step.key}
                  done={step.done}
                  href={step.href}
                  title={t(`checklist.steps.${step.key}.title` as "checklist.steps.contact.title")}
                  description={t(
                    `checklist.steps.${step.key}.description` as "checklist.steps.contact.description",
                  )}
                  actionLabel={t(
                    `checklist.steps.${step.key}.action` as "checklist.steps.contact.action",
                  )}
                />
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("activity.title")}</h2>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("activity.empty")}</p>
        ) : (
          <Card className="py-1">
            <ul className="flex flex-col">
              {recentActivity.map((activity) => (
                <li
                  key={activity.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b py-3 text-sm last:border-b-0"
                >
                  <span>
                    <Link
                      href={`/contacts/${activity.contactId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {activity.contactName}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      {tActivity(activity.type)}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(activity.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
