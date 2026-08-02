import Link from "next/link";
import { SquareKanban } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { listPipelines, listStagesForPipeline } from "@/modules/crm/pipelines";
import { listDealsForPipeline } from "@/modules/crm/deals";
import { listContacts } from "@/modules/crm/contacts";
import { PipelineBoard } from "./PipelineBoard";
import { CreateDealForm } from "./CreateDealForm";
import { createPipelineAction } from "./actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ pipeline?: string }>;
}) {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.pipeline");
  const { pipeline: pipelineParam } = await searchParams;

  const pipelines = await listPipelines(ctx);
  const pipeline =
    pipelines.find((p) => p.id === pipelineParam) ?? pipelines[0];

  if (!pipeline) {
    return (
      <div className="flex flex-col gap-8">
        <EmptyState
          icon={SquareKanban}
          title={t("noPipeline")}
          description={t("noPipelineBody")}
        />
        <NewPipelineForm t={t} />
      </div>
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

      {pipelines.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label={t("switcherLabel")}>
          {pipelines.map((p) => (
            <Link
              key={p.id}
              href={`/pipeline?pipeline=${p.id}`}
              className={`rounded-full border px-3 py-1 text-sm ${
                p.id === pipeline.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}

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
          <CreateDealForm
            pipelineId={pipeline.id}
            contacts={contacts.map((contact) => ({ id: contact.id, name: contact.name }))}
            stages={stages.map((stage) => ({ id: stage.id, name: stage.name }))}
          />
        )}
      </section>

      <NewPipelineForm t={t} />
    </div>
  );
}

function NewPipelineForm({
  t,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <section id="nueva-pipeline" className="scroll-mt-6">
      <h2 className="mb-4 text-lg font-semibold">{t("newPipelineTitle")}</h2>
      <form action={createPipelineAction} className="flex max-w-sm flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t("newPipelineName")}
          <input
            name="name"
            required
            placeholder={t("newPipelineNamePlaceholder")}
            className="rounded-md border px-3 py-2"
          />
        </label>
        <Button type="submit" variant="outline" className="w-fit">
          {t("newPipelineCreate")}
        </Button>
      </form>
    </section>
  );
}
