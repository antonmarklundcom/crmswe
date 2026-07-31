import {
  isSortField,
  type ContactListOptions,
  type ContactQuery,
  type SortDirection,
} from "@/modules/crm/contact-list";

// One parser for the contacts list's URL state, shared by the page and the
// CSV route. Both must read the same params the same way — that is what makes
// "export what I'm looking at" true rather than aspirational.

export type ContactSearchParams = {
  search?: string;
  tagId?: string;
  source?: string;
  ownerUserId?: string;
  openDeal?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parseContactQuery(params: ContactSearchParams): ContactQuery {
  const createdTo = parseDate(params.to);
  // A date input gives midnight; the user means "through the end of that day".
  if (createdTo) createdTo.setHours(23, 59, 59, 999);

  return {
    search: params.search || undefined,
    tagId: params.tagId || undefined,
    source: params.source || undefined,
    ownerUserId: params.ownerUserId || undefined,
    hasOpenDeal: params.openDeal === "1",
    createdFrom: parseDate(params.from),
    createdTo,
  };
}

export function parseContactOptions(params: ContactSearchParams): ContactListOptions {
  const sort = isSortField(params.sort) ? params.sort : undefined;
  const direction: SortDirection | undefined =
    params.dir === "asc" || params.dir === "desc" ? params.dir : undefined;
  const page = Number.parseInt(params.page ?? "", 10);

  return {
    sort,
    direction,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** True when any filter is active — distinguishes "no data" from "no match". */
export function hasActiveFilters(params: ContactSearchParams): boolean {
  return Boolean(
    params.search ||
      params.tagId ||
      params.source ||
      params.ownerUserId ||
      params.openDeal === "1" ||
      params.from ||
      params.to,
  );
}

/** Rebuilds the querystring with overrides — used by sort headers and paging. */
export function buildContactHref(
  params: ContactSearchParams,
  overrides: Partial<ContactSearchParams>,
): string {
  const next = new URLSearchParams();
  const merged = { ...params, ...overrides };

  for (const [key, value] of Object.entries(merged)) {
    if (value) next.set(key, String(value));
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}
