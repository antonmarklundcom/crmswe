import Link from "next/link";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { useLocale } from "next-intl";
import { formatDateTime } from "@/lib/i18n/format";

import { cn } from "@/lib/utils";

// Shared task rendering (PLAN.md §10 1J #3) — the contact record's Tareas
// tab and the dashboard's "due today" list are the same list shape, filtered
// differently, so one component draws both.

export type TaskRow = {
  id: string;
  title: string;
  dueAt: Date;
  completed: boolean;
  /** Only set when rendered outside the contact it belongs to (dashboard). */
  contactId?: string;
  contactName?: string;
};

export type TaskListLabels = {
  complete: string;
  reopen: string;
  delete: string;
  overdue: string;
};

export function TaskList({
  tasks,
  labels,
  onComplete,
  onReopen,
  onDelete,
}: {
  tasks: TaskRow[];
  labels: TaskListLabels;
  onComplete: (formData: FormData) => Promise<void>;
  onReopen: (formData: FormData) => Promise<void>;
  onDelete: (formData: FormData) => Promise<void>;
}) {
  const locale = useLocale();
  const now = Date.now();

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {tasks.map((task) => {
        const overdue = !task.completed && task.dueAt.getTime() < now;
        return (
          <li
            key={task.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className={cn("font-medium", task.completed && "text-muted-foreground line-through")}>
                {task.title}
              </span>
              <span className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
                {formatDateTime(task.dueAt, locale)}
                {overdue && ` · ${labels.overdue}`}
                {task.contactName && task.contactId && (
                  <>
                    {" · "}
                    <Link href={`/contacts/${task.contactId}`} className="underline underline-offset-4">
                      {task.contactName}
                    </Link>
                  </>
                )}
              </span>
            </div>
            <div className="flex shrink-0 gap-1">
              <form action={task.completed ? onReopen : onComplete}>
                <input type="hidden" name="taskId" value={task.id} />
                <button
                  type="submit"
                  title={task.completed ? labels.reopen : labels.complete}
                  className="flex size-7 items-center justify-center rounded-md border hover:bg-accent"
                >
                  {task.completed ? (
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Check className="size-3.5" aria-hidden="true" />
                  )}
                </button>
              </form>
              <form action={onDelete}>
                <input type="hidden" name="taskId" value={task.id} />
                <button
                  type="submit"
                  title={labels.delete}
                  className="flex size-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
