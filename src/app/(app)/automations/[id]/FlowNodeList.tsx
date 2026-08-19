import { getTranslations } from "next-intl/server";
import type { FlowGraph, TriggerType } from "@/modules/automations/graph";

// Mobile fallback for the node canvas (PLAN.md §13 H7). Touch editing of a
// drag-and-drop canvas is not a Phase 1 problem worth solving badly, so a
// phone gets an honest read-only list of what the flow does and a line
// saying where to edit it. The canvas itself is hidden below `md`.
export async function FlowNodeList({
  graph,
  triggerType,
}: {
  graph: FlowGraph | null;
  triggerType: TriggerType;
}) {
  const t = await getTranslations("app.automations");

  return (
    <section className="flex flex-col gap-3 md:hidden">
      <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
        {t("editor.mobileReadOnly")}
      </p>

      <ol className="flex flex-col gap-2 text-sm">
        <li className="rounded-md border px-3 py-2">
          <span className="font-medium">{t("editor.triggerNode")}</span>
          <span className="block text-muted-foreground">
            {t(`triggers.${triggerType}` as "triggers.form_submitted")}
          </span>
        </li>
        {(graph?.nodes ?? []).map((node, index) => (
          <li key={node.id} className="rounded-md border px-3 py-2">
            <span className="font-medium">
              {index + 1}. {t(`editor.palette.${node.type}` as "editor.palette.send_whatsapp")}
            </span>
          </li>
        ))}
        {(graph?.nodes ?? []).length === 0 && (
          <li className="text-muted-foreground">{t("editor.mobileEmpty")}</li>
        )}
      </ol>
    </section>
  );
}
