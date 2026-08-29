import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { plans } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { SuperadminContext } from "./context";

// Plan catalog (PLAN.md §4: name, duration_months 3|6|12, price in minor
// units of the platform currency — öre for SEK (plan.md §1.2),
// limits/features JSON). Superadmin-managed, platform-level table.

export type PlanDurationMonths = 3 | 6 | 12;

export type CreatePlanInput = {
  name: string;
  durationMonths: PlanDurationMonths;
  price: number;
  limits?: Record<string, unknown>;
  features?: Record<string, unknown>;
};

export async function createPlan(
  _ctx: SuperadminContext,
  input: CreatePlanInput,
) {
  const id = newId();

  await db.insert(plans).values({
    id,
    name: input.name,
    durationMonths: input.durationMonths,
    price: input.price,
    limits: input.limits ?? {},
    features: { factura_electronica: "coming_soon", ...(input.features ?? {}) },
    isActive: true,
  });

  return getPlan(id);
}

export async function listPlans(includeInactive = false) {
  const rows = await db.select().from(plans).orderBy(plans.durationMonths);
  return includeInactive ? rows : rows.filter((p) => p.isActive);
}

export async function getPlan(planId: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  return plan ?? null;
}

export async function setPlanActive(
  _ctx: SuperadminContext,
  planId: string,
  isActive: boolean,
) {
  await db.update(plans).set({ isActive }).where(eq(plans.id, planId));
  return getPlan(planId);
}
