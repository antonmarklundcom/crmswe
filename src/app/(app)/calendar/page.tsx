import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { requireTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import { listTenantUsers } from "@/modules/tenancy/users";
import { queryContacts } from "@/modules/crm/contact-list";
import { listCalendarEntries } from "@/modules/calendar/agenda";
import { bucketByDay, buildRange, isCalendarView, type CalendarView } from "@/modules/calendar/grid";
import { isDayKey, startOfDay, todayIn, weekdayOf } from "@/modules/calendar/zoned-time";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/form-fields";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { DEFAULT_TIMEZONE, formatDate, formatTime } from "@/lib/i18n/format";
import { EventForm } from "./EventForm";
import { createCalendarEventAction } from "./actions";

// The agenda (PLAN.md §10 — calendar module). Server-rendered: the whole view
// is "which window am I looking at", which the URL already answers, so
// navigating a week is a link rather than a client-side date library.

/** Saturday or Sunday, for the columns that should recede. */
function isWeekend(day: string): boolean {
  const weekday = weekdayOf(day);
  return weekday === 0 || weekday === 6;
}

export type CalendarSearchParams = {
  view?: string;
  date?: string;
  assignedUserId?: string;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<CalendarSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.calendar");
  const locale = await getLocale();

  const tenant = await getTenant(ctx.tenantId);
  const timeZone = tenant?.timezone || DEFAULT_TIMEZONE;

  const view: CalendarView = isCalendarView(params.view) ? params.view : "week";
  const anchor = isDayKey(params.date) ? params.date : todayIn(timeZone);
  const range = buildRange(view, anchor, timeZone);

  const assignedUserId = params.assignedUserId || undefined;

  const [entries, users, contactPage] = await Promise.all([
    listCalendarEntries(ctx, range.from, range.to, { assignedUserId }),
    listTenantUsers(ctx),
    // The booking form's contact picker. Alphabetical and capped: a tenant
    // with thousands of contacts books against the ones they can find by
    // name here, and against the rest from the contact record itself.
    queryContacts(ctx, {}, { sort: "name", direction: "asc", perPage: 200 }),
  ]);

  const buckets = bucketByDay(entries, range.days, timeZone);
  const userNames = new Map(users.map((user) => [user.id, user.name]));

  function href(overrides: Partial<CalendarSearchParams>): string {
    const next = new URLSearchParams();
    const merged = { view, date: anchor, assignedUserId, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, String(value));
    }
    return `/calendar?${next.toString()}`;
  }

  const monthLabel = formatDate(
    startOfDay(range.view === "week" ? range.days[0] : `${anchor.slice(0, 7)}-01`, timeZone),
    locale,
    { month: "long", year: "numeric" },
    timeZone,
  );

  const isMonth = view === "month";

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <PageHeader
          title={t("title")}
          description={t("intro")}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={href({ view: "week" })}
                className={cn(
                  buttonVariants({ variant: view === "week" ? "default" : "outline", size: "sm" }),
                )}
              >
                {t("week")}
              </Link>
              <Link
                href={href({ view: "month" })}
                className={cn(
                  buttonVariants({ variant: isMonth ? "default" : "outline", size: "sm" }),
                )}
              >
                {t("month")}
              </Link>
            </div>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href={href({ date: range.previous })}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("previous")}
            </Link>
            <Link
              href={href({ date: range.today })}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("today")}
            </Link>
            <Link
              href={href({ date: range.next })}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("next")}
            </Link>
            <span className="ml-2 text-sm font-medium first-letter:uppercase">{monthLabel}</span>
          </div>

          <form method="get" className="flex items-end gap-2">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="date" value={anchor} />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("assignee")}
              <Select name="assignedUserId" defaultValue={assignedUserId ?? ""}>
                <option value="">{t("allAssignees")}</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="outline" size="sm">
              {t("filter")}
            </Button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[46rem] grid-cols-7 gap-px rounded-md border bg-border">
            {range.days.slice(0, 7).map((day) => (
              <div
                key={`head-${day}`}
                className={cn(
                  "bg-card px-2 py-1 text-xs font-medium first-letter:uppercase",
                  isWeekend(day) && "text-muted-foreground",
                )}
              >
                {formatDate(startOfDay(day, timeZone), locale, { weekday: "short" }, timeZone)}
              </div>
            ))}

            {range.days.map((day) => {
              const dayEntries = buckets.get(day) ?? [];
              const isToday = day === range.today;
              const outsideMonth = isMonth && day.slice(0, 7) !== anchor.slice(0, 7);

              return (
                <div
                  key={day}
                  className={cn(
                    "flex flex-col gap-1 bg-card p-2",
                    isMonth ? "min-h-24" : "min-h-56",
                    // Weekends and days from the neighbouring month recede,
                    // so the week you asked for is the one you read first.
                    isWeekend(day) && "bg-muted/40",
                    outsideMonth && "bg-muted/60 text-muted-foreground",
                    isToday && "bg-accent/60",
                  )}
                >
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      isToday
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {formatDate(startOfDay(day, timeZone), locale, { day: "numeric" }, timeZone)}
                  </span>

                  {dayEntries.map((entry) => (
                    <Link
                      key={`${entry.kind}-${entry.id}-${day}`}
                      href={entry.href}
                      className={cn(
                        "rounded border px-1.5 py-1 text-xs leading-tight hover:bg-accent",
                        entry.kind === "task" && "border-dashed",
                        entry.done && "line-through opacity-60",
                      )}
                    >
                      <span className="block truncate font-medium">{entry.title}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {entry.allDay
                          ? t("allDay")
                          : formatTime(entry.startsAt, locale, timeZone)}
                        {entry.assignedUserId && ` · ${userNames.get(entry.assignedUserId) ?? ""}`}
                      </span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {entries.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            {t("emptyRange")}
          </p>
        )}
      </section>

      <section id="nueva-cita" className="scroll-mt-6">
        <h2 className="mb-4 text-lg font-semibold">{t("createTitle")}</h2>
        <div className="max-w-2xl">
          <EventForm
            action={createCalendarEventAction}
            defaults={{ startDate: anchor, endDate: anchor }}
            contacts={contactPage.rows.map((contact) => ({
              id: contact.id,
              name: contact.name,
            }))}
            users={users.map((user) => ({ id: user.id, name: user.name }))}
            submitLabel={t("createAction")}
          />
        </div>
      </section>
    </div>
  );
}
