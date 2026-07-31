import Link from "next/link";
import { Download, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { listContacts, listTags } from "@/modules/crm/contacts";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { createContactAction, createTagAction } from "./actions";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tagId?: string }>;
}) {
  const { search, tagId } = await searchParams;
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.contacts");
  const tc = await getTranslations("common");

  const [contacts, tags] = await Promise.all([
    listContacts(ctx, { search, tagId }),
    listTags(ctx),
  ]);

  const hasFilters = Boolean(search || tagId);
  // A first-time tenant and a search that found nothing are different
  // problems: one needs an explanation of the feature, the other just needs
  // its filters cleared.
  const isFirstTime = contacts.length === 0 && !hasFilters;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <PageHeader
          title={t("title")}
          description={t("intro")}
          action={
            contacts.length > 0 ? (
              // Carries the current filters, so "exportar" always means
              // "what this list is showing".
              <a
                href={`/api/exports/contacts?${new URLSearchParams({
                  ...(search ? { search } : {}),
                  ...(tagId ? { tagId } : {}),
                }).toString()}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <Download className="size-4" aria-hidden="true" />
                {t("exportCsv")}
              </a>
            ) : undefined
          }
        />

        {!isFirstTime && (
        <form className="flex flex-wrap gap-2" method="get">
          <input
            name="search"
            defaultValue={search ?? ""}
            placeholder={t("searchPlaceholder")}
            className="rounded-md border px-3 py-2 text-sm"
          />
          <select name="tagId" defaultValue={tagId ?? ""} className="rounded-md border px-3 py-2 text-sm">
            <option value="">{t("allTags")}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            {t("filter")}
          </Button>
        </form>
        )}

        {isFirstTime ? (
          <EmptyState
            icon={Users}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            actionLabel={t("emptyAction")}
            actionHref="#nuevo-contacto"
          />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("noResults")}
            description={t("noResultsBody")}
            actionLabel={t("clearFilters")}
            actionHref="/contacts"
          />
        ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">{t("name")}</th>
              <th className="py-2">{t("phone")}</th>
              <th className="py-2">{t("email")}</th>
              <th className="py-2">{t("source")}</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-b">
                <td className="py-2">
                  <Link href={`/contacts/${contact.id}`} className="underline">
                    {contact.name}
                  </Link>
                </td>
                <td className="py-2">{contact.phone}</td>
                <td className="py-2">{contact.email}</td>
                <td className="py-2">{contact.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </section>

      <section id="nuevo-contacto" className="scroll-mt-6">
        <h2 className="mb-4 text-lg font-semibold">{t("createTitle")}</h2>
        <form action={createContactAction} className="flex max-w-sm flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("name")}
            <input name="name" required className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("phone")}
            <input name="phone" required className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("email")}
            <input name="email" type="email" className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("source")}
            <input name="source" className="rounded-md border px-3 py-2" />
          </label>
          <Button type="submit">{tc("create")}</Button>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("createTagTitle")}</h2>
        <form action={createTagAction} className="flex max-w-sm gap-2">
          <input name="name" required className="flex-1 rounded-md border px-3 py-2 text-sm" />
          <Button type="submit" variant="outline">
            {tc("create")}
          </Button>
        </form>
      </section>
    </div>
  );
}
