import { and, gte, lte, type SQL } from "drizzle-orm";
import { contacts, deals, stages } from "@/db/schema";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { listContacts, type ListContactsFilters } from "./contacts";

// The contacts list as a real table (PLAN.md §10 1J #1): sorting, the filters
// a rep actually reaches for, and pagination. One shape serves both the
// screen and the CSV export, so "exportar" always means "what this list is
// showing" — the property that makes an export trustworthy.

export const CONTACT_SORT_FIELDS = ["name", "createdAt", "phone"] as const;
export type ContactSortField = (typeof CONTACT_SORT_FIELDS)[number];
export type SortDirection = "asc" | "desc";

export type ContactQuery = ListContactsFilters & {
  /** Only contacts with a deal in a stage that is neither won nor lost. */
  hasOpenDeal?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
};

export type ContactListOptions = {
  sort?: ContactSortField;
  direction?: SortDirection;
  page?: number;
  perPage?: number;
};

export const DEFAULT_PER_PAGE = 25;

function compare(
  a: typeof contacts.$inferSelect,
  b: typeof contacts.$inferSelect,
  field: ContactSortField,
): number {
  switch (field) {
    case "name":
      // localeCompare so ñ and accents order the way a Spanish speaker expects
      // rather than by code point.
      return a.name.localeCompare(b.name, "es");
    case "phone":
      return a.phone.localeCompare(b.phone);
    case "createdAt":
      return a.createdAt.getTime() - b.createdAt.getTime();
  }
}

/**
 * Resolves every filter, then sorts and pages.
 *
 * `listContacts` already owns search/tag/owner/source and the tenant
 * predicate, so this composes on top of it rather than duplicating that
 * logic — the date range narrows in SQL (cheap, indexed by tenant), and
 * has-open-deal is applied in memory from one extra scoped read, since it
 * needs the stage's won/lost flags and tenantDb exposes no join helper.
 */
export async function queryContacts(
  ctx: TenantContext,
  query: ContactQuery = {},
  options: ContactListOptions = {},
) {
  const dateConditions: SQL[] = [];
  if (query.createdFrom) dateConditions.push(gte(contacts.createdAt, query.createdFrom));
  if (query.createdTo) dateConditions.push(lte(contacts.createdAt, query.createdTo));

  let rows = await listContacts(ctx, {
    search: query.search,
    tagId: query.tagId,
    ownerUserId: query.ownerUserId,
    source: query.source,
  });

  if (dateConditions.length > 0) {
    const dateFiltered = await tenantDb(ctx).select(
      contacts,
      dateConditions.length === 1 ? dateConditions[0] : (and(...dateConditions) as SQL),
    );
    const allowed = new Set(dateFiltered.map((row) => row.id));
    rows = rows.filter((row) => allowed.has(row.id));
  }

  if (query.hasOpenDeal) {
    const [dealRows, stageRows] = await Promise.all([
      tenantDb(ctx).select(deals),
      tenantDb(ctx).select(stages),
    ]);
    const closed = new Set(
      stageRows.filter((stage) => stage.isWon || stage.isLost).map((stage) => stage.id),
    );
    const withOpenDeal = new Set(
      dealRows.filter((deal) => !closed.has(deal.stageId)).map((deal) => deal.contactId),
    );
    rows = rows.filter((row) => withOpenDeal.has(row.id));
  }

  const sort = options.sort ?? "createdAt";
  const direction = options.direction ?? (sort === "createdAt" ? "desc" : "asc");
  const sorted = [...rows].sort((a, b) => {
    const result = compare(a, b, sort);
    return direction === "asc" ? result : -result;
  });

  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  // Clamp rather than 404: a filter change that shrinks the result set below
  // the current page should land on the last page, not an error.
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);
  const start = (page - 1) * perPage;

  return {
    rows: sorted.slice(start, start + perPage),
    total,
    page,
    pageCount,
    perPage,
  };
}

/** Distinct non-empty `source` values, for the filter dropdown. */
export async function listContactSources(ctx: TenantContext): Promise<string[]> {
  const rows = await tenantDb(ctx).select(contacts);
  const sources = new Set(
    rows.map((row) => row.source).filter((source): source is string => Boolean(source)),
  );
  return [...sources].sort((a, b) => a.localeCompare(b, "es"));
}

/** Contact ids that currently have an open deal — used to badge the table. */
export async function contactsWithOpenDeals(ctx: TenantContext): Promise<Set<string>> {
  const [dealRows, stageRows] = await Promise.all([
    tenantDb(ctx).select(deals),
    tenantDb(ctx).select(stages),
  ]);
  const closed = new Set(
    stageRows.filter((stage) => stage.isWon || stage.isLost).map((stage) => stage.id),
  );
  return new Set(
    dealRows.filter((deal) => !closed.has(deal.stageId)).map((deal) => deal.contactId),
  );
}

export function isSortField(value: string | undefined): value is ContactSortField {
  return CONTACT_SORT_FIELDS.includes(value as ContactSortField);
}
