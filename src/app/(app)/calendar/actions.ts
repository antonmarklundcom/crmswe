"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import { DEFAULT_TIMEZONE } from "@/lib/i18n/format";
import { addDays, zonedTimeToUtc } from "@/modules/calendar/zoned-time";
import {
  CalendarEventError,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/modules/calendar/events";

// Agenda forms. Same useActionState shape as the contact forms (§10 1R #6):
// a bad range comes back as state under the field that caused it rather than
// as Next's error page.

export type CalendarField = "title" | "startDate" | "endDate";

export type CalendarFormState = {
  error: string | null;
  field: CalendarField | null;
  saved: boolean;
  values: Record<string, string>;
};

const eventSchema = z.object({
  title: z.string().min(1).max(300),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  allDay: z.boolean(),
  location: z.string().max(300).optional().or(z.literal("")),
  description: z.string().max(5000).optional().or(z.literal("")),
  contactId: z.string().max(26).optional().or(z.literal("")),
  assignedUserId: z.string().max(26).optional().or(z.literal("")),
});

function submitted(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function read(formData: FormData) {
  return {
    title: formData.get("title"),
    startDate: formData.get("startDate"),
    startTime: formData.get("startTime") || undefined,
    endDate: formData.get("endDate") || "",
    endTime: formData.get("endTime") || "",
    allDay: formData.get("allDay") === "on" || formData.get("allDay") === "1",
    location: formData.get("location") || "",
    description: formData.get("description") || "",
    contactId: formData.get("contactId") || "",
    assignedUserId: formData.get("assignedUserId") || "",
  };
}

async function tenantTimezone(tenantId: string): Promise<string> {
  const tenant = await getTenant(tenantId);
  return tenant?.timezone || DEFAULT_TIMEZONE;
}

/**
 * The form speaks the tenant's wall clock; the database speaks UTC (§2.3).
 * All-day is the whole local day — midnight to the next midnight — so it
 * still answers a plain overlap query alongside timed events.
 */
function resolveRange(
  input: z.infer<typeof eventSchema>,
  timeZone: string,
): { startsAt: Date; endsAt: Date } {
  const endDate = input.endDate || input.startDate;

  if (input.allDay) {
    return {
      startsAt: zonedTimeToUtc(input.startDate, "00:00", timeZone),
      endsAt: zonedTimeToUtc(addDays(endDate, 1), "00:00", timeZone),
    };
  }

  const startTime = input.startTime || "09:00";
  // An end time left blank means an hour, which is what almost every
  // appointment is and saves the rep a field.
  const endTime = input.endTime || null;
  const startsAt = zonedTimeToUtc(input.startDate, startTime, timeZone);
  const endsAt = endTime
    ? zonedTimeToUtc(endDate, endTime, timeZone)
    : new Date(startsAt.getTime() + 60 * 60 * 1000);

  return { startsAt, endsAt };
}

function failure(state: Partial<CalendarFormState>, formData: FormData): CalendarFormState {
  return {
    error: state.error ?? "unknown",
    field: state.field ?? null,
    saved: false,
    values: submitted(formData),
  };
}

export async function createCalendarEventAction(
  _prevState: CalendarFormState,
  formData: FormData,
): Promise<CalendarFormState> {
  const ctx = await requireTenantContext();
  const parsed = eventSchema.safeParse(read(formData));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return failure(
      {
        error: field === "title" ? "titleRequired" : "dateInvalid",
        field: field === "title" ? "title" : "startDate",
      },
      formData,
    );
  }

  const timeZone = await tenantTimezone(ctx.tenantId);
  const range = resolveRange(parsed.data, timeZone);

  try {
    await createCalendarEvent(ctx, {
      title: parsed.data.title,
      description: parsed.data.description || null,
      location: parsed.data.location || null,
      contactId: parsed.data.contactId || null,
      assignedUserId: parsed.data.assignedUserId || null,
      allDay: parsed.data.allDay,
      ...range,
    });
  } catch (err) {
    if (err instanceof CalendarEventError && err.code === "invalidRange") {
      return failure({ error: "endBeforeStart", field: "endDate" }, formData);
    }
    return failure({ error: "unknown" }, formData);
  }

  revalidatePath("/calendar");
  // Cleared: the event is now a cell in the grid above the form.
  return { error: null, field: null, saved: true, values: {} };
}

export async function updateCalendarEventAction(
  eventId: string,
  _prevState: CalendarFormState,
  formData: FormData,
): Promise<CalendarFormState> {
  const ctx = await requireTenantContext();
  const parsed = eventSchema.safeParse(read(formData));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return failure(
      {
        error: field === "title" ? "titleRequired" : "dateInvalid",
        field: field === "title" ? "title" : "startDate",
      },
      formData,
    );
  }

  const timeZone = await tenantTimezone(ctx.tenantId);
  const range = resolveRange(parsed.data, timeZone);

  try {
    await updateCalendarEvent(ctx, eventId, {
      title: parsed.data.title,
      description: parsed.data.description || null,
      location: parsed.data.location || null,
      contactId: parsed.data.contactId || null,
      assignedUserId: parsed.data.assignedUserId || null,
      allDay: parsed.data.allDay,
      ...range,
    });
  } catch (err) {
    if (err instanceof CalendarEventError) {
      if (err.code === "invalidRange") {
        return failure({ error: "endBeforeStart", field: "endDate" }, formData);
      }
      // "forbidden" and "notFound" are the same sentence to the person
      // reading it: this is not yours to change.
      return failure({ error: "notAllowed" }, formData);
    }
    return failure({ error: "unknown" }, formData);
  }

  revalidatePath("/calendar");
  revalidatePath(`/calendar/${eventId}`);
  return { error: null, field: null, saved: true, values: submitted(formData) };
}

export async function deleteCalendarEventAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const parsed = z.string().min(1).max(26).safeParse(formData.get("eventId"));
  if (!parsed.success) return;

  try {
    await deleteCalendarEvent(ctx, parsed.data);
  } catch (err) {
    if (err instanceof CalendarEventError) {
      redirect(`/calendar/${parsed.data}?error=${err.code}`);
    }
    throw err;
  }

  revalidatePath("/calendar");
  redirect("/calendar");
}
