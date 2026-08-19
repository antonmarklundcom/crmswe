import { like, or, sql } from "drizzle-orm";
import { contacts, conversations, deals, documents, quotes } from "@/db/schema";
import { normalizePhone, type CountryCode } from "@/lib/phone";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Cross-entity search behind the ⌘K palette (PLAN.md §13 H8). Everything
// goes through tenantDb, so a result set can only ever contain the caller's
// own tenant — the palette is the one place in the product that reads across
// five tables at once, which makes that scoping the whole security story.

export type SearchKind = "contact" | "deal" | "quote" | "document" | "conversation";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type SearchResults = {
  query: string;
  hits: SearchHit[];
};

const PER_KIND = 5;

/** Digits-only view of the query, so "0981 123 456", "981123456" and
 * "+595981123456" all find the same contact. */
function phoneVariants(query: string, country: CountryCode | undefined): string[] {
  const digits = query.replace(/\D/g, "");
  if (digits.length < 4) return [];

  const variants = new Set<string>([digits]);
  try {
    if (country) variants.add(normalizePhone(query, country).replace(/\D/g, ""));
  } catch {
    // Not phone-shaped; the name/email match still applies.
  }
  return [...variants];
}

export async function searchTenant(
  ctx: TenantContext,
  rawQuery: string,
  defaultCountry?: CountryCode,
): Promise<SearchResults> {
  const query = rawQuery.trim();
  if (query.length < 2) return { query, hits: [] };

  const term = `%${query}%`;
  const db = tenantDb(ctx);

  const phoneMatches = phoneVariants(query, defaultCountry).map(
    // Compare digits to digits: stored phones are E.164, the typed query
    // rarely is.
    (digits) => sql`replace(replace(replace(${contacts.phone}, '+', ''), '-', ''), ' ', '') like ${`%${digits}%`}`,
  );

  const [contactRows, dealRows, quoteRows, documentRows, conversationRows] = await Promise.all([
    db.select(
      contacts,
      or(like(contacts.name, term), like(contacts.email, term), ...phoneMatches),
    ),
    db.select(deals, like(deals.title, term)),
    db.select(quotes, like(quotes.number, term)),
    db.select(documents, like(documents.number, term)),
    // Conversations carry no text of their own; they are reached by the
    // contact behind them, which is how a rep thinks about them anyway.
    db.select(conversations),
  ]);

  const contactById = new Map(contactRows.map((row) => [row.id, row]));

  const hits: SearchHit[] = [
    ...contactRows.slice(0, PER_KIND).map((row) => ({
      kind: "contact" as const,
      id: row.id,
      title: row.name,
      subtitle: row.phone,
      href: `/contacts/${row.id}`,
    })),
    ...dealRows.slice(0, PER_KIND).map((row) => ({
      kind: "deal" as const,
      id: row.id,
      title: row.title,
      subtitle: `${row.value} ${row.currency}`,
      href: `/pipeline/${row.id}`,
    })),
    ...quoteRows.slice(0, PER_KIND).map((row) => ({
      kind: "quote" as const,
      id: row.id,
      title: row.number,
      subtitle: `${row.total} ${row.currency}`,
      href: `/quotes/${row.id}`,
    })),
    ...documentRows.slice(0, PER_KIND).map((row) => ({
      kind: "document" as const,
      id: row.id,
      title: row.number,
      subtitle: `${row.total} ${row.currency}`,
      href: `/documents/${row.id}`,
    })),
    ...conversationRows
      .filter((row) => contactById.has(row.contactId))
      .slice(0, PER_KIND)
      .map((row) => {
        const contact = contactById.get(row.contactId)!;
        return {
          kind: "conversation" as const,
          id: row.id,
          title: contact.name,
          subtitle: contact.phone,
          href: `/inbox/${row.id}`,
        };
      }),
  ];

  return { query, hits };
}
