import { and, eq, isNull, lte } from "drizzle-orm";
import { tasks } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Follow-ups / reminders (PLAN.md §10 1J #3). A due-dated task against a
// contact or deal — the "who do I call today" surface the CRM had nothing
// for before this.

export type CreateTaskInput = {
  contactId: string;
  dealId?: string;
  title: string;
  dueAt: Date;
  assignedUserId?: string;
};

export async function createTask(ctx: TenantContext, input: CreateTaskInput) {
  const id = newId();
  await tenantDb(ctx)
    .insert(tasks)
    .values({
      id,
      contactId: input.contactId,
      dealId: input.dealId,
      title: input.title,
      dueAt: input.dueAt,
      assignedUserId: input.assignedUserId,
    });
  return getTask(ctx, id);
}

export async function getTask(ctx: TenantContext, id: string) {
  const [row] = await tenantDb(ctx).select(tasks, eq(tasks.id, id));
  return row ?? null;
}

export async function listTasksForContact(ctx: TenantContext, contactId: string) {
  const rows = await tenantDb(ctx).select(tasks, eq(tasks.contactId, contactId));
  return rows.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/**
 * Open tasks due at or before `asOf` (default now) — the dashboard's
 * "due today" list draws from this, and "due before now" is exactly the
 * overdue set, so one query serves both without a separate overdue read.
 */
export async function listOpenTasksDueBy(ctx: TenantContext, asOf: Date = new Date()) {
  const rows = await tenantDb(ctx).select(
    tasks,
    and(isNull(tasks.completedAt), lte(tasks.dueAt, asOf)),
  );
  return rows.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export async function listOpenTasksForTenant(ctx: TenantContext) {
  const rows = await tenantDb(ctx).select(tasks, isNull(tasks.completedAt));
  return rows.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export async function completeTask(ctx: TenantContext, id: string) {
  await tenantDb(ctx).update(tasks).set({ completedAt: new Date() }).where(eq(tasks.id, id));
  return getTask(ctx, id);
}

/** Undo — a task marked done by mistake shouldn't need deleting and redoing. */
export async function reopenTask(ctx: TenantContext, id: string) {
  await tenantDb(ctx).update(tasks).set({ completedAt: null }).where(eq(tasks.id, id));
  return getTask(ctx, id);
}

export async function deleteTask(ctx: TenantContext, id: string) {
  await tenantDb(ctx).delete(tasks, eq(tasks.id, id));
}
