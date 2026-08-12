import { Globe } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import { listSites } from "@/modules/sites/sites";
import { siteSettings, siteTurnstileSiteKey } from "@/modules/sites/settings";
import { listPipelines, listStagesForPipeline } from "@/modules/crm/pipelines";
import { listAccountsForTenant } from "@/modules/whatsapp/accounts";
import { getLeadStats } from "@/modules/leads/stats";
import { env } from "@/lib/config/env";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SiteGuide, type GuideLabels } from "./SiteGuide";
import { NewSiteForm, RotateKeyButton, type KeyLabels } from "./SiteKeyForms";
import { SiteTurnstileForm } from "./SiteTurnstileForm";
import { toggleSiteActiveAction, updateSiteRoutingAction } from "./actions";

export default async function SitesPage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.sites");

  if (ctx.role !== "admin") {
    return <p className="text-muted-foreground">{t("adminOnly")}</p>;
  }

  const tg = await getTranslations("app.sites.guide");

  const [sites, pipelines, waAccounts, stats, tenant] = await Promise.all([
    listSites(ctx),
    listPipelines(ctx),
    listAccountsForTenant(ctx),
    getLeadStats(ctx),
    getTenant(ctx.tenantId),
  ]);

  // Stages across every pipeline — each site normally routes into its own
  // pipeline (dentista vs materiales are different businesses), so the
  // picker has to span them rather than assume one.
  const stageOptions = (
    await Promise.all(
      pipelines.map(async (pipeline) => {
        const stages = await listStagesForPipeline(ctx, pipeline.id);
        return stages.map((stage) => ({
          id: stage.id,
          label: `${pipeline.name} › ${stage.name}`,
        }));
      }),
    )
  ).flat();

  const labels: KeyLabels = {
    copyNow: t("copyNow"),
    name: t("name"),
    slug: t("slug"),
    domain: t("domain"),
    pipeline: t("pipeline"),
    stage: t("stage"),
    waAccount: t("waAccount"),
    none: t("none"),
    create: t("createSite"),
    rotate: t("rotateKey"),
  };

  const guideLabels: GuideLabels = {
    title: tg("title"),
    intro: tg("intro"),
    steps: (["create", "env", "handler", "verify"] as const).map((key) => ({
      title: tg(`steps.${key}.title`),
      body: tg(`steps.${key}.body`),
    })),
    snippetTitle: tg("snippetTitle"),
    copy: tg("copy"),
    copied: tg("copied"),
    securityTitle: tg("securityTitle"),
    securityPoints: (["serverSide", "idempotency", "phone", "spam", "nonBlocking"] as const).map(
      (key) => tg(`security.${key}`),
    ),
  };

  const leadsBySite = new Map(stats.bySite.map((bucket) => [bucket.key, bucket.count]));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <PageHeader title={t("title")} description={t("intro")} />

        <div className="flex gap-6 text-sm">
          <span>
            <strong>{stats.total}</strong> {t("totalLeads")}
          </span>
          <span>
            <strong>{stats.withDeal}</strong> {t("leadsWithDeal")}
          </span>
        </div>

        {sites.length === 0 ? (
          <EmptyState
            icon={Globe}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            actionLabel={t("createSite")}
            actionHref="#nuevo-sitio"
          />
        ) : (
        <ul className="flex flex-col gap-4">
          {sites.map((site) => (
            <li key={site.id} className="flex flex-col gap-3 rounded-md border px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">
                    {site.name}{" "}
                    <span className="text-sm text-muted-foreground">{site.domain}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {site.isActive ? t("active") : t("inactive")} ·{" "}
                    <code className="font-mono text-xs">{site.apiKeyPrefix}…</code> ·{" "}
                    {leadsBySite.get(site.id) ?? 0} {t("leads")}
                  </p>
                </div>
                <form action={toggleSiteActiveAction}>
                  <input type="hidden" name="siteId" value={site.id} />
                  <input type="hidden" name="isActive" value={site.isActive ? "false" : "true"} />
                  <Button type="submit" size="sm" variant="outline">
                    {site.isActive ? t("deactivate") : t("activate")}
                  </Button>
                </form>
              </div>

              <form action={updateSiteRoutingAction} className="flex flex-wrap items-end gap-2 text-sm">
                <input type="hidden" name="siteId" value={site.id} />
                <label className="flex flex-col gap-1">
                  {t("stage")}
                  <select
                    name="defaultStageId"
                    defaultValue={site.defaultStageId ?? ""}
                    className="rounded-md border px-2 py-1"
                  >
                    <option value="">{t("none")}</option>
                    {stageOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  {t("waAccount")}
                  <select
                    name="waAccountId"
                    defaultValue={site.waAccountId ?? ""}
                    className="rounded-md border px-2 py-1"
                  >
                    <option value="">{t("none")}</option>
                    {waAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.displayNumber || account.phoneNumberId}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" size="sm" variant="outline">
                  {t("saveRouting")}
                </Button>
              </form>

              <RotateKeyButton siteId={site.id} labels={labels} />

              <SiteTurnstileForm
                siteId={site.id}
                configured={!!siteSettings(site).turnstile}
                siteKey={siteTurnstileSiteKey(site)}
                requireOnIngest={siteSettings(site).turnstile?.requireOnIngest ?? false}
              />
            </li>
          ))}
        </ul>
        )}
      </section>

      <section id="nuevo-sitio" className="scroll-mt-6">
        <h2 className="mb-4 text-lg font-semibold">{t("createTitle")}</h2>
        <NewSiteForm
          labels={labels}
          pipelines={pipelines.map((p) => ({ id: p.id, label: p.name }))}
          stages={stageOptions}
          waAccounts={waAccounts.map((a) => ({
            id: a.id,
            label: a.displayNumber || a.phoneNumberId,
          }))}
        />
      </section>

      <SiteGuide
        appUrl={env.APP_URL}
        formEndpointExample={`${env.APP_URL}/f/${tenant?.slug ?? "tu-empresa"}/contacto`}
        labels={guideLabels}
      />

      {stats.byCampaign.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">{t("byCampaign")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {stats.byCampaign.map((bucket) => (
              <li key={bucket.key} className="flex justify-between rounded-md border px-3 py-2">
                <span>{bucket.key}</span>
                <strong>{bucket.count}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
