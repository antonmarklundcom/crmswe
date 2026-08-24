import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { requireTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import { listTenantUsers } from "@/modules/tenancy/users";
import { queryContacts } from "@/modules/crm/contact-list";
import { getContact } from "@/modules/crm/contacts";
import { canModifyEvent, getCalendarEvent } from "@/modules/calendar/events";
import { toLocalFields } from "@/modules/calendar/zoned-time";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { DEFAULT_TIMEZONE, formatDateTime } from "@/lib/i18n/format";
import { EventForm } from "../EventForm";
import { deleteCalendarEventAction, updateCalendarEventAction } from "../actions";

// One appointment. Read-only for anyone it isn't theirs to change (§3.2 +
// modules/calendar/events.ts: creator, assignee, or an admin) — the form is
// simply not rendered for them, and the action refuses regardless.

export default async function CalendarEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.calendar");
  const locale = await getLocale();

  const event = await getCalendarEvent(ctx, id);
  if (!event) notFound();

  const tenant = await getTenant(ctx.tenantId);
  const timeZone = tenant?.timezone || DEFAULT_TIMEZONE;

  const [users, contactPage, contact] = await Promise.all([
    listTenantUsers(ctx),
    queryContacts(ctx, {}, { sort: "name", direction: "asc", perPage: 200 }),
    event.contactId ? getContact(ctx, event.contactId) : Promise.resolve(null),
  ]);

  const start = toLocalFields(event.startsAt, timeZone);
  // All-day events are stored ending at the next local midnight; the form
  // shows the last day they cover, which is the day the rep booked.
  const end = toLocalFields(
    event.allDay ? new Date(event.endsAt.getTime() - 1) : event.endsAt,
    timeZone,
  );

  const editable = canModifyEvent(ctx, event);
  const assigneeName = event.assignedUserId
    ? (users.find((user) => user.id === event.assignedUserId)?.name ?? null)
    : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={event.title}
        description={
          event.allDay
            ? t("allDay")
            : `${formatDateTime(event.startsAt, locale, timeZone)} — ${formatDateTime(
                event.endsAt,
                locale,
                timeZone,
              )}`
        }
        action={
          <Link
            href="/calendar"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {t("backToCalendar")}
          </Link>
        }
      />

      <dl className="grid max-w-2xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {event.location && (
          <>
            <dt className="text-muted-foreground">{t("form.location")}</dt>
            <dd>{event.location}</dd>
          </>
        )}
        {contact && (
          <>
            <dt className="text-muted-foreground">{t("form.contact")}</dt>
            <dd>
              <Link href={`/contacts/${contact.id}`} className="underline underline-offset-4">
                {contact.name}
              </Link>
            </dd>
          </>
        )}
        {assigneeName && (
          <>
            <dt className="text-muted-foreground">{t("form.assignee")}</dt>
            <dd>{assigneeName}</dd>
          </>
        )}
        {event.description && (
          <>
            <dt className="text-muted-foreground">{t("form.description")}</dt>
            <dd className="whitespace-pre-wrap">{event.description}</dd>
          </>
        )}
      </dl>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("errors.notAllowed")}
        </p>
      )}

      {editable ? (
        <section className="max-w-2xl">
          <h2 className="mb-4 text-lg font-semibold">{t("editTitle")}</h2>
          <EventForm
            action={updateCalendarEventAction.bind(null, event.id)}
            defaults={{
              title: event.title,
              startDate: start.date,
              startTime: start.time,
              endDate: end.date,
              endTime: end.time,
              allDay: event.allDay,
              location: event.location ?? "",
              description: event.description ?? "",
              contactId: event.contactId ?? "",
              assignedUserId: event.assignedUserId ?? "",
            }}
            contacts={contactPage.rows.map((row) => ({ id: row.id, name: row.name }))}
            users={users.map((user) => ({ id: user.id, name: user.name }))}
            submitLabel={t("saveAction")}
          />

          <form action={deleteCalendarEventAction} className="mt-6">
            <input type="hidden" name="eventId" value={event.id} />
            <Button type="submit" variant="outline" className="text-destructive">
              {t("deleteAction")}
            </Button>
          </form>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
      )}
    </div>
  );
}
