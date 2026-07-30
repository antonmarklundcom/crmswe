import Link from "next/link";
import { SquareKanban } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { listPipelines, listStagesForPipeline } from "@/modules/crm/pipelines";
import { listDealsForPipeline } from "@/modules/crm/deals";
import { listContacts } from "@/modules/crm/contacts";
import { PipelineBoard } from "./PipelineBoard";
import { createDealAction } from "./actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default async function PipelinePage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.pipeline");

  const pipelines = await listPipelines(ctx);
  const pipeline = pipelines[0];

  if (!pipeline) {
    return (
      <EmptyState
        icon={SquareKanban}
        title={t("noPipeline")}
        description={t("noPipelineBody")}
      />
    );
  }

  const [stages, deals, contacts] = await Promise.all([
    listStagesForPipeline(ctx, pipeline.id),
    listDealsForPipeline(ctx, pipeline.id),
    listContacts(ctx),
  ]);

  const contactsById = new Map(contacts.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={pipeline.name} description={t("intro")} />

      {deals.length === 0 ? (
        <EmptyState
          icon={SquareKanban}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          actionLabel={contacts.length > 0 ? t("createDeal") : undefined}
          actionHref={contacts.length > 0 ? "#nuevo-negocio" : undefined}
        />
      ) : (
        <PipelineBoard
          stages={stages}
          deals={deals.map((deal) => ({
            ...deal,
            contactName: contactsById.get(deal.contactId)?.name ?? deal.contactId,
          }))}
        />
      )}

      <section id="nuevo-negocio" className="scroll-mt-6">
        <h2 className="mb-4 text-lg font-semibold">{t("createDealTitle")}</h2>
        {/* A deal hangs off a contact (§5), so the form is unusable before
            there is one — say so instead of rendering an empty picker. */}
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("needContact")}{" "}
            <Link href="/contacts" className="underline underline-offset-4">
              {t("goToContacts")}
            </Link>
          </p>
        ) : (
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
        )}
      </section>
    </div>
  );
}
