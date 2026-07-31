"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/modules/tenancy/context";
import { createTask, completeTask, reopenTask, deleteTask } from "@/modules/crm/tasks";

// Task actions reachable from the contact record and the dashboard — kept
// separate from actions.ts (contact CRUD) since both the contact page and
// the dashboard bind these, and neither needs the other's imports.

const createTaskSchema = z.object({
  contactId: z.string().min(1),
  dealId: z.string().min(1).optional(),
  title: z.string().min(1).max(300),
  dueAt: z.string().min(1),
});

export async function createTaskAction(contactId: string, formData: FormData) {
  const ctx = await requireTenantContext();
  const input = createTaskSchema.parse({
    contactId,
    dealId: formData.get("dealId") || undefined,
    title: formData.get("title"),
    dueAt: formData.get("dueAt"),
  });

  await createTask(ctx, {
    contactId: input.contactId,
    dealId: input.dealId,
    title: input.title,
    dueAt: new Date(input.dueAt),
  });
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/dashboard");
}

/**
 * Bound with `redirectPath` first (the page revalidating itself — a contact
 * record or the dashboard), reading which task from the form itself. TaskList
 * renders one `<form action={...}>` per row, so the per-row identity has to
 * travel in the FormData rather than as a second bound argument.
 */
export async function completeTaskAction(redirectPath: string, formData: FormData) {
  const ctx = await requireTenantContext();
  const taskId = z.string().min(1).parse(formData.get("taskId"));
  await completeTask(ctx, taskId);
  revalidatePath(redirectPath);
  revalidatePath("/dashboard");
}

export async function reopenTaskAction(redirectPath: string, formData: FormData) {
  const ctx = await requireTenantContext();
  const taskId = z.string().min(1).parse(formData.get("taskId"));
  await reopenTask(ctx, taskId);
  revalidatePath(redirectPath);
  revalidatePath("/dashboard");
}

export async function deleteTaskAction(redirectPath: string, formData: FormData) {
  const ctx = await requireTenantContext();
  const taskId = z.string().min(1).parse(formData.get("taskId"));
  await deleteTask(ctx, taskId);
  revalidatePath(redirectPath);
  revalidatePath("/dashboard");
}
