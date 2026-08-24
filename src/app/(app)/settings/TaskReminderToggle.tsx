import { Button } from "@/components/ui/button";
import { setTaskRemindersAction } from "./actions";

// Per-user opt-out for the daily reminder mail (PLAN.md §13 H6). Like the
// language switcher, this is the user's own setting on an otherwise
// admin-only page — an agent gets it too.
export function TaskReminderToggle({
  enabled,
  labels,
}: {
  enabled: boolean;
  labels: { on: string; off: string; enable: string; disable: string };
}) {
  return (
    <form action={setTaskRemindersAction} className="flex flex-wrap items-center gap-3">
      <span className={`text-sm ${enabled ? "text-success" : "text-muted-foreground"}`}>
        {enabled ? labels.on : labels.off}
      </span>
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <Button type="submit" size="sm" variant="outline">
        {enabled ? labels.disable : labels.enable}
      </Button>
    </form>
  );
}
