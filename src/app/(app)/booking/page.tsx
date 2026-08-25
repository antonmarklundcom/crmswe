import { CalendarClock } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/i18n/format";
import { env } from "@/lib/config/env";
import { requireTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import { listUsersForTenant } from "@/modules/tenancy/users";
import { listBookingTypes } from "@/modules/booking/types";
import {
  listAvailabilityRules,
  listResources,
  listResourcesForType,
} from "@/modules/booking/resources";
import { listBookings } from "@/modules/booking/bookings";
import { getContact } from "@/modules/crm/contacts";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  AvailabilityForm,
  NewBookingTypeForm,
  NewResourceForm,
  TypeResourcesPicker,
} from "./BookingForms";
import {
  cancelBookingByStaffAction,
  markNoShowAction,
  toggleBookingTypeAction,
  toggleResourceAction,
} from "./actions";

// Booking configuration (docs/SPEC-BOOKING.md §6). Tenant configuration, so
// admin-only for the same reason /sites is — and the nav hides it from an
// agent rather than showing a page whose every button throws.

export default async function BookingPage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.booking");
  const locale = await getLocale();

  if (ctx.role !== "admin") {
    return <p className="text-muted-foreground">{t("adminOnly")}</p>;
  }

  const [tenant, types, resources, members, upcoming] = await Promise.all([
    getTenant(ctx.tenantId),
    listBookingTypes(ctx),
    listResources(ctx),
    listUsersForTenant(ctx.tenantId),
    listBookings(ctx, { from: new Date() }),
  ]);

  const rules = await listAvailabilityRules(ctx);
  const typeResources = await Promise.all(
    types.map(async (type) => [type.id, await listResourcesForType(ctx, type.id)] as const),
  );
  const resourcesByType = new Map(typeResources);

  const contacts = new Map(
    await Promise.all(
      [...new Set(upcoming.map((booking) => booking.contactId))].map(
        async (id) => [id, await getContact(ctx, id)] as const,
      ),
    ),
  );

  const weekdays = [0, 1, 2, 3, 4, 5, 6].map((day) => t(`weekday${day}` as "weekday0"));
  const errorLabels = {
    nameRequired: t("errors.nameRequired"),
    slugTaken: t("errors.slugTaken"),
    durationInvalid: t("errors.durationInvalid"),
    invalidTime: t("errors.invalidTime"),
    invalidRange: t("errors.invalidRange"),
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("intro")} />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">{t("typesTitle")}</h2>
        <NewBookingTypeForm
          labels={{
            name: t("name"),
            slug: t("slug"),
            duration: t("duration"),
            create: t("createType"),
            errors: errorLabels,
          }}
        />

        {types.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={t("typesTitle")}
            description={t("typesEmpty")}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {types.map((type) => (
              <li key={type.id} className="flex flex-col gap-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{type.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("duration", { minutes: type.durationMinutes })}
                    </p>
                  </div>
                  <form action={toggleBookingTypeAction.bind(null, type.id, !type.isActive)}>
                    <button type="submit" className="text-xs underline">
                      {type.isActive ? t("active") : t("inactive")}
                    </button>
                  </form>
                </div>
                <a
                  className="text-sm underline"
                  href={`${env.APP_URL}/b/${tenant?.slug}/${type.slug}`}
                >
                  {`${env.APP_URL}/b/${tenant?.slug}/${type.slug}`}
                </a>
                <a className="text-sm underline" href={`/booking/${type.id}`}>
                  {t("configure")}
                </a>
                <TypeResourcesPicker
                  bookingTypeId={type.id}
                  resources={resources.map((resource) => ({
                    id: resource.id,
                    name: resource.name,
                  }))}
                  selected={(resourcesByType.get(type.id) ?? []).map((resource) => resource.id)}
                  label={t("resourcesTitle")}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">{t("resourcesTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("resourcesIntro")}</p>
        </div>
        <NewResourceForm
          labels={{
            name: t("resourceName"),
            kindUser: t("resourceKindUser"),
            kindResource: t("resourceKindResource"),
            user: t("resourceUser"),
            none: "—",
            create: t("newResource"),
            errors: errorLabels,
          }}
          users={members.map((member) => ({
            id: member.id,
            label: member.name || member.email,
          }))}
        />

        {resources.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={t("resourcesTitle")}
            description={t("resourcesEmpty")}
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {resources.map((resource) => {
              const initial: Record<number, Array<{ start: string; end: string }>> = {};
              for (const rule of rules.filter((row) => row.resourceId === resource.id)) {
                initial[rule.weekday] = [
                  ...(initial[rule.weekday] ?? []),
                  { start: rule.startTime, end: rule.endTime },
                ];
              }

              return (
                <li key={resource.id} className="flex flex-col gap-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{resource.name}</p>
                    <form action={toggleResourceAction.bind(null, resource.id, !resource.isActive)}>
                      <button type="submit" className="text-xs underline">
                        {resource.isActive ? t("active") : t("inactive")}
                      </button>
                    </form>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("availabilityTitle", { name: resource.name })} · {t("availabilityIntro")}
                  </p>
                  <AvailabilityForm
                    resourceId={resource.id}
                    initial={initial}
                    labels={{
                      from: t("from"),
                      to: t("to"),
                      addRange: t("addRange"),
                      save: t("saveAvailability"),
                      weekdays,
                      errors: errorLabels,
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t("upcomingTitle")}</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("upcomingEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((booking) => {
              const contact = contacts.get(booking.contactId);
              const statusLabel = {
                confirmed: t("statusConfirmed"),
                cancelled: t("statusCancelled"),
                completed: t("statusCompleted"),
                no_show: t("statusNoShow"),
              }[booking.status];

              return (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <span>
                    {formatDateTime(booking.startsAt, locale, tenant?.timezone)} ·{" "}
                    {contact?.name ?? "—"} · {statusLabel}
                  </span>
                  {booking.status === "confirmed" ? (
                    <span className="flex gap-3">
                      <form action={markNoShowAction.bind(null, booking.id)}>
                        <button type="submit" className="text-xs underline">
                          {t("markNoShow")}
                        </button>
                      </form>
                      <form action={cancelBookingByStaffAction.bind(null, booking.id)}>
                        <button type="submit" className="text-xs underline text-destructive">
                          {t("cancel")}
                        </button>
                      </form>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
