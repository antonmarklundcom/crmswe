import Link from "next/link";
import { ArrowDown, ArrowUp, Download, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { listTags } from "@/modules/crm/contacts";
import {
  contactsWithOpenDeals,
  listContactSources,
  queryContacts,
  type ContactSortField,
} from "@/modules/crm/contact-list";
import { listTenantUsers } from "@/modules/tenancy/users";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { createContactAction, createTagAction } from "./actions";
import {
  buildContactHref,
  hasActiveFilters,
  parseContactOptions,
  parseContactQuery,
  type ContactSearchParams,
} from "./query";

const date = new Intl.DateTimeFormat("es-PY", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<ContactSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.contacts");
  const tc = await getTranslations("common");

  const query = parseContactQuery(params);
  const options = parseContactOptions(params);

  const [page, tags, sources, users, openDeals] = await Promise.all([
    queryContacts(ctx, query, options),
    listTags(ctx),
    listContactSources(ctx),
    listTenantUsers(ctx),
    contactsWithOpenDeals(ctx),
  ]);

  const filtered = hasActiveFilters(params);
  const isFirstTime = page.total === 0 && !filtered;
  const userNames = new Map(users.map((user) => [user.id, user.name]));

  const activeSort = options.sort ?? "createdAt";
  const activeDir = options.direction ?? (activeSort === "createdAt" ? "desc" : "asc");

  /** Column header that toggles direction when it's already the active sort. */
  function SortHeader({
    field,
    label,
    className,
  }: {
    field: ContactSortField;
    label: string;
    className?: string;
  }) {
    const isActive = activeSort === field;
    const nextDir = isActive && activeDir === "asc" ? "desc" : "asc";
    return (
      <th className={cn("py-2 font-medium", className)}>
        <Link
          href={buildContactHref(params, { sort: field, dir: nextDir, page: "1" })}
          className="inline-flex items-center gap-1 hover:underline"
        >
          {label}
          {isActive &&
            (activeDir === "asc" ? (
              <ArrowUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-3.5" aria-hidden="true" />
            ))}
        </Link>
      </th>
    );
  }

  const exportHref = `/api/exports/contacts${buildContactHref(params, { page: undefined })}`;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <PageHeader
          title={t("title")}
          description={t("intro")}
          action={
            page.total > 0 ? (
              <a
                href={exportHref}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <Download className="size-4" aria-hidden="true" />
                {t("exportCsv")}
              </a>
            ) : undefined
          }
        />

        {!isFirstTime && (
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("searchLabel")}
              <input
                name="search"
                defaultValue={params.search ?? ""}
                placeholder={t("searchPlaceholder")}
                className="rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("tag")}
              <select
                name="tagId"
                defaultValue={params.tagId ?? ""}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="">{t("allTags")}</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("source")}
              <select
                name="source"
                defaultValue={params.source ?? ""}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="">{t("allSources")}</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("owner")}
              <select
                name="ownerUserId"
                defaultValue={params.ownerUserId ?? ""}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="">{t("allOwners")}</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("createdFrom")}
              <input
                name="from"
                type="date"
                defaultValue={params.from ?? ""}
                className="rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("createdTo")}
              <input
                name="to"
                type="date"
                defaultValue={params.to ?? ""}
                className="rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 py-2 text-sm">
              <input
                type="checkbox"
                name="openDeal"
                value="1"
                defaultChecked={params.openDeal === "1"}
              />
              {t("onlyOpenDeal")}
            </label>
            {/* Sorting lives in the URL too, so it must survive a filter submit. */}
            {params.sort && <input type="hidden" name="sort" value={params.sort} />}
            {params.dir && <input type="hidden" name="dir" value={params.dir} />}
            <Button type="submit" variant="outline" size="sm">
              {t("filter")}
            </Button>
            {filtered && (
              <Link
                href="/contacts"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                {t("clearFilters")}
              </Link>
            )}
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
        ) : page.total === 0 ? (
          <EmptyState
            icon={Users}
            title={t("noResults")}
            description={t("noResultsBody")}
            actionLabel={t("clearFilters")}
            actionHref="/contacts"
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("resultCount", { count: page.total })}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <SortHeader field="name" label={t("name")} />
                    <SortHeader field="phone" label={t("phone")} />
                    <th className="py-2 font-medium">{t("email")}</th>
                    <th className="py-2 font-medium">{t("source")}</th>
                    <th className="py-2 font-medium">{t("owner")}</th>
                    <SortHeader field="createdAt" label={t("created")} />
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((contact) => (
                    <tr key={contact.id} className="border-b">
                      <td className="py-2">
                        <Link
                          href={`/contacts/${contact.id}`}
                          className="underline underline-offset-4"
                        >
                          {contact.name}
                        </Link>
                        {openDeals.has(contact.id) && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] whitespace-nowrap">
                            {t("openDealBadge")}
                          </span>
                        )}
                      </td>
                      <td className="py-2 tabular-nums">{contact.phone}</td>
                      <td className="py-2">{contact.email}</td>
                      <td className="py-2">{contact.source}</td>
                      <td className="py-2">
                        {contact.ownerUserId ? userNames.get(contact.ownerUserId) : ""}
                      </td>
                      <td className="py-2 tabular-nums">{date.format(contact.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {page.pageCount > 1 && (
              <nav className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {t("pageOf", { page: page.page, pages: page.pageCount })}
                </span>
                <span className="flex gap-2">
                  <Link
                    href={buildContactHref(params, { page: String(page.page - 1) })}
                    aria-disabled={page.page <= 1}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      page.page <= 1 && "pointer-events-none opacity-50",
                    )}
                  >
                    {t("previous")}
                  </Link>
                  <Link
                    href={buildContactHref(params, { page: String(page.page + 1) })}
                    aria-disabled={page.page >= page.pageCount}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      page.page >= page.pageCount && "pointer-events-none opacity-50",
                    )}
                  >
                    {t("next")}
                  </Link>
                </span>
              </nav>
            )}
          </>
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
          <input
            name="name"
            required
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <Button type="submit" variant="outline">
            {tc("create")}
          </Button>
        </form>
      </section>
    </div>
  );
}
