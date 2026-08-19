import { buildSystemTenantContext } from "@/modules/tenancy/context";
import { listTenants } from "@/modules/tenancy/tenants";
import { listUsersForTenant } from "@/modules/tenancy/users";
import { getContact } from "@/modules/crm/contacts";
import { listOpenTasksDueBy } from "@/modules/crm/tasks";
import { sendEmail } from "@/lib/email";
import { taskRemindersEmail } from "@/lib/email/templates";
import { env } from "@/lib/config/env";
import { reportError } from "@/lib/observability";

// Daily task reminders (PLAN.md §13 H6). listOpenTasksDueBy has existed
// since the tasks work landed and nothing ever called it outside the
// dashboard — a task due yesterday sat there until someone happened to look.
//
// One email per user per run, listing only *their* assigned tasks: a shared
// digest of the whole tenant's work is a digest everyone ignores. Users who
// opted out (users.task_reminders) are skipped, and a user with nothing due
// gets nothing — an empty reminder is how a daily email becomes noise.

export type TaskReminderResult = { usersEmailed: number; tasksListed: number };

export async function sendTaskReminders(now: Date = new Date()): Promise<TaskReminderResult> {
  const result: TaskReminderResult = { usersEmailed: 0, tasksListed: 0 };

  for (const tenant of await listTenants()) {
    // Reminders are work *about* the tenant's data, not writes to it, so a
    // grace-period tenant still gets them — being read-only doesn't make a
    // customer callback less due.
    const ctx = await buildSystemTenantContext(tenant.id);
    if (!ctx) continue;

    try {
      const due = await listOpenTasksDueBy(ctx, now);
      if (due.length === 0) continue;

      const users = await listUsersForTenant(tenant.id);

      for (const user of users) {
        if (!user.email || user.banned || !user.taskReminders) continue;

        const mine = due.filter((task) => task.assignedUserId === user.id);
        if (mine.length === 0) continue;

        const items = await Promise.all(
          mine.map(async (task) => {
            const contact = task.contactId ? await getContact(ctx, task.contactId) : null;
            return {
              title: task.title,
              dueAt: task.dueAt,
              overdue: task.dueAt.getTime() < now.getTime(),
              contactName: contact?.name ?? null,
              url: task.contactId ? `${env.APP_URL}/contacts/${task.contactId}` : env.APP_URL,
            };
          }),
        );

        const { subject, html } = await taskRemindersEmail({
          userName: user.name,
          items,
          tasksUrl: `${env.APP_URL}/dashboard`,
          locale: user.locale ?? tenant.locale,
        });

        const sent = await sendEmail({ to: user.email, subject, html });
        if (sent) result.usersEmailed += 1;
        result.tasksListed += mine.length;
      }
    } catch (err) {
      // One tenant's failure must not stop everyone else's reminders.
      reportError(err, { tags: { area: "task-reminders" }, extra: { tenantId: tenant.id } });
    }
  }

  return result;
}
