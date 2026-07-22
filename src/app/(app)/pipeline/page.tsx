import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { listPipelines, listStagesForPipeline } from "@/modules/crm/pipelines";
import { listDealsForPipeline } from "@/modules/crm/deals";
import { listContacts } from "@/modules/crm/contacts";
import { PipelineBoard } from "./PipelineBoard";
import { createDealAction } from "./actions";
import { Button } from "@/components/ui/button";

export default async function PipelinePage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.pipeline");

  const pipelines = await listPipelines(ctx);
  const pipeline = pipelines[0];

  if (!pipeline) {
    return <p className="text-muted-foreground">{t("noPipeline")}</p>;
  }

  const [stages, deals, contacts] = await Promise.all([
    listStagesForPipeline(ctx, pipeline.id),
    listDealsForPipeline(ctx, pipeline.id),
    listContacts(ctx),
  ]);

  const contactsById = new Map(contacts.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">{pipeline.name}</h1>

      <PipelineBoard
        stages={stages}
        deals={deals.map((deal) => ({
          ...deal,
          contactName: contactsById.get(deal.contactId)?.name ?? deal.contactId,
        }))}
      />

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("createDealTitle")}</h2>
        <form action={createDealAction} className="flex max-w-sm flex-col gap-4">
          <input type="hidden" name="pipelineId" value={pipeline.id} />
          <label className="flex flex-col gap-1 text-sm">
            {t("dealTitle")}
            <input name="title" required className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("contact")}
            <select name="contactId" required className="rounded-md border px-3 py-2">
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("stage")}
            <select name="stageId" required className="rounded-md border px-3 py-2">
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("value")}
            <input name="value" type="number" min={0} className="rounded-md border px-3 py-2" />
          </label>
          <Button type="submit">{t("createDeal")}</Button>
        </form>
      </section>
    </div>
  );
}
