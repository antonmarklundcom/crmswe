import { ClipboardList } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import { listForms } from "@/modules/forms/forms";
import { listPipelines, listStagesForPipeline } from "@/modules/crm/pipelines";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { createFormAction } from "./actions";

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ pipeline?: string }>;
}) {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.forms");
  const { pipeline: pipelineParam } = await searchParams;

  const [tenant, forms, pipelines] = await Promise.all([
    getTenant(ctx.tenantId),
    listForms(ctx),
    listPipelines(ctx),
  ]);
  const pipeline = pipelines.find((p) => p.id === pipelineParam) ?? pipelines[0];
  const stages = pipeline ? await listStagesForPipeline(ctx, pipeline.id) : [];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <PageHeader title={t("title")} description={t("intro")} />

        {forms.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            actionLabel={t("createForm")}
            actionHref="#nuevo-formulario"
          />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {forms.map((form) => (
              <li key={form.id} className="rounded-md border px-3 py-2">
                <p className="font-medium">{form.name}</p>
                <p className="text-muted-foreground">
                  {tenant && `/f/${tenant.slug}/${form.slug}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="nuevo-formulario" className="scroll-mt-6">
        <h2 className="mb-4 text-lg font-semibold">{t("createTitle")}</h2>

        {pipelines.length > 1 && pipeline && (
          <form method="get" className="mb-4 flex items-end gap-2 text-sm">
            <label className="flex flex-col gap-1">
              {t("targetPipeline")}
              <select
                name="pipeline"
                defaultValue={pipeline.id}
                className="rounded-md border px-3 py-2"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline">
              {t("targetPipelineApply")}
            </Button>
          </form>
        )}

        <form action={createFormAction} className="flex max-w-sm flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("name")}
            <input name="name" required className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("slug")}
            <input name="slug" required className="rounded-md border px-3 py-2" />
          </label>
          {pipeline && (
            <>
              <input type="hidden" name="targetPipelineId" value={pipeline.id} />
              <label className="flex flex-col gap-1 text-sm">
                {t("targetStage")}
                <select name="targetStageId" className="rounded-md border px-3 py-2">
                  <option value="">{t("noStage")}</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <Button type="submit">{t("createForm")}</Button>
        </form>
      </section>
    </div>
  );
}
