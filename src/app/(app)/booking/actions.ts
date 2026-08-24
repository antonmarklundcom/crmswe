"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import { slugify } from "@/lib/slug";
import {
  createBookingType,
  getBookingType,
  getBookingTypeBySlug,
  updateBookingType,
} from "@/modules/booking/types";
import {
  createResource,
  replaceAvailabilityRules,
  setResourcesForType,
  updateResource,
  BookingConfigError,
} from "@/modules/booking/resources";
import { cancelBooking, markNoShow } from "@/modules/booking/bookings";

// useActionState-shaped (PLAN.md §10 1R #6): a missing name or a bad time
// comes back inline instead of throwing to Next's error page. Every action
// here goes through requireTenantAdmin — booking configuration is tenant
// configuration (§3.2), and the nav hides the page from an agent for the
// same reason /sites does.

export type FormState = { error: string | null; values: Record<string, string> };

// The initial value lives in BookingForms.tsx, not here: a "use server"
// module may only export async functions.
const emptyFormState: FormState = { error: null, values: {} };

const newTypeSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().max(100).optional().or(z.literal("")),
  durationMinutes: z.coerce.number().int().min(1).max(60 * 12),
});

export async function createBookingTypeAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenantAdmin();
  const values = {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    durationMinutes: String(formData.get("durationMinutes") ?? "30"),
  };

  const parsed = newTypeSchema.safeParse(values);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      error: field === "durationMinutes" ? "durationInvalid" : "nameRequired",
      values,
    };
  }

  const slug = slugify(parsed.data.slug || parsed.data.name);
  // Checked here rather than left to the unique index so the admin gets the
  // reason on the form instead of a 500 from a duplicate-key error.
  if (await getBookingTypeBySlug(ctx, slug)) {
    return { error: "slugTaken", values };
  }

  await createBookingType(ctx, {
    name: parsed.data.name,
    slug,
    durationMinutes: parsed.data.durationMinutes,
  });

  revalidatePath("/booking");
  return emptyFormState;
}

export async function toggleBookingTypeAction(id: string, isActive: boolean): Promise<void> {
  const ctx = await requireTenantAdmin();
  const type = await getBookingType(ctx, id);
  if (!type) return;

  await updateBookingType(ctx, id, {
    name: type.name,
    slug: type.slug,
    description: type.description,
    durationMinutes: type.durationMinutes,
    bufferBeforeMinutes: type.bufferBeforeMinutes,
    bufferAfterMinutes: type.bufferAfterMinutes,
    slotIncrementMinutes: type.slotIncrementMinutes,
    minNoticeMinutes: type.minNoticeMinutes,
    maxAdvanceDays: type.maxAdvanceDays,
    maxPerDay: type.maxPerDay,
    assignment: type.assignment,
    locationMode: type.locationMode,
    locationDetail: type.locationDetail,
    createDeal: type.createDeal,
    defaultPipelineId: type.defaultPipelineId,
    defaultStageId: type.defaultStageId,
    defaultTagIds: (type.defaultTagIds as string[] | null) ?? [],
    defaultOwnerUserId: type.defaultOwnerUserId,
    questions: (type.questions as never) ?? [],
    settings: (type.settings as never) ?? {},
    isActive,
    color: type.color,
  });

  revalidatePath("/booking");
}

const newResourceSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["user", "resource"]),
  userId: z.string().max(26).optional().or(z.literal("")),
});

export async function createResourceAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenantAdmin();
  const values = {
    name: String(formData.get("name") ?? ""),
    kind: String(formData.get("kind") ?? "user"),
    userId: String(formData.get("userId") ?? ""),
  };

  const parsed = newResourceSchema.safeParse(values);
  if (!parsed.success) return { error: "nameRequired", values };

  await createResource(ctx, {
    kind: parsed.data.kind,
    userId: parsed.data.userId || null,
    name: parsed.data.name,
  });

  revalidatePath("/booking");
  return emptyFormState;
}

export async function toggleResourceAction(id: string, isActive: boolean): Promise<void> {
  const ctx = await requireTenantAdmin();
  await updateResource(ctx, id, { isActive });
  revalidatePath("/booking");
}

/**
 * Saves a resource's whole week at once. Set-based rather than row-based
 * because the editor is a week grid: a partial save that left yesterday's
 * Tuesday behind is the bug this shape prevents.
 */
export async function saveAvailabilityAction(
  resourceId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenantAdmin();

  const rules: Array<{ weekday: number; start: string; end: string }> = [];
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const starts = formData.getAll(`start_${weekday}`).map(String);
    const ends = formData.getAll(`end_${weekday}`).map(String);
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index]?.trim();
      const end = ends[index]?.trim();
      // A blank pair is how the grid says "closed", not an error.
      if (!start && !end) continue;
      if (!start || !end) return { error: "invalidTime", values: {} };
      rules.push({ weekday, start, end });
    }
  }

  try {
    await replaceAvailabilityRules(ctx, resourceId, rules);
  } catch (error) {
    if (error instanceof BookingConfigError) {
      return { error: error.code === "invalidTime" ? "invalidTime" : "invalidRange", values: {} };
    }
    throw error;
  }

  revalidatePath("/booking");
  return emptyFormState;
}

export async function setTypeResourcesAction(
  bookingTypeId: string,
  resourceIds: string[],
): Promise<void> {
  const ctx = await requireTenantAdmin();
  await setResourcesForType(ctx, bookingTypeId, resourceIds);
  revalidatePath("/booking");
}

export async function markNoShowAction(id: string): Promise<void> {
  const ctx = await requireTenantAdmin();
  await markNoShow(ctx, id);
  revalidatePath("/booking");
}

export async function cancelBookingByStaffAction(id: string): Promise<void> {
  const ctx = await requireTenantAdmin();
  // Staff are never bound by the visitor's cancellation cutoff — somebody has
  // to be able to clear a day when the shop closes unexpectedly.
  await cancelBooking(ctx, id, "staff");
  revalidatePath("/booking");
}
