import { inArray, like, or, sql } from "drizzle-orm";
import { contacts, conversations, deals, documents, quotes } from "@/db/schema";
import { formatMoney } from "@/lib/i18n/format";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getTranslator } from "@/lib/i18n/translator";
import { escapeLike } from "@/lib/sql-like";
import { normalizePhone, type CountryCode } from "@/lib/phone";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Cross-entity search behind the ⌘K palette (PLAN.md §13 H8). Everything
// goes through tenantDb, so a result set can only ever contain the caller's
// own tenant — the palette is the one place in the product that reads across
// five tables at once, which makes that scoping the whole security story.
//
// The other constraint is volume: this runs on every keystroke the debounce
// lets through, so every query below is bounded in SQL. Fetching a whole
// table and slicing in JS is affordable on a page load and not here — see
// PER_KIND and the conversations lookup.

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
  locale: string = DEFAULT_LOCALE,
): Promise<SearchResults> {
  const query = rawQuery.trim();
  if (query.length < 2) return { query, hits: [] };

  const term = `%${escapeLike(query)}%`;
  const db = tenantDb(ctx);

  const phoneMatches = phoneVariants(query, defaultCountry).map(
    // Compare digits to digits: stored phones are E.164, the typed query
    // rarely is.
    (digits) =>
      sql`replace(replace(replace(${contacts.phone}, '+', ''), '-', ''), ' ', '') like ${`%${escapeLike(digits)}%`}`,
  );

  const [contactRows, dealRows, quoteRows, documentRows] = await Promise.all([
    db
      .select(contacts, or(like(contacts.name, term), like(contacts.email, term), ...phoneMatches))
      .limit(PER_KIND),
    db.select(deals, like(deals.title, term)).limit(PER_KIND),
    db.select(quotes, like(quotes.number, term)).limit(PER_KIND),
    db.select(documents, like(documents.number, term)).limit(PER_KIND),
  ]);

  // Conversations carry no text of their own; they are reached by the
  // contact behind them, which is how a rep thinks about them anyway. That
  // makes them a lookup *by the contacts already matched* — previously this
  // read every conversation row the tenant owned, on every keystroke, to
  // then throw nearly all of them away.
  const contactById = new Map(contactRows.map((row) => [row.id, row]));
  const conversationRows = contactById.size
    ? await db
        .select(conversations, inArray(conversations.contactId, [...contactById.keys()]))
        .limit(PER_KIND)
    : [];

  const money = (amount: number, currency: string) => formatMoney(amount, currency, locale);
  // Offert and faktura amounts are netto everywhere in the app, so a bare
  // figure beside an invoice number would read as what the customer owes —
  // which is the brutto. Same convention, and same suffix, as the contact
  // timeline (plan.md §5.2 exit criterion).
  const t = await getTranslator(locale, "app.documents");
  const exclVat = t("exclVat");

  const hits: SearchHit[] = [
    ...contactRows.map((row) => ({
      kind: "contact" as const,
      id: row.id,
      title: row.name,
      subtitle: row.phone,
      href: `/contacts/${row.id}`,
    })),
    ...dealRows.map((row) => ({
      kind: "deal" as const,
      id: row.id,
      title: row.title,
      // Money goes through the same formatter as every other screen (§13
      // H5 #5) — the palette used to print raw minor units, so a deal worth
      // 12 500,00 kr read as "1250000" here and correctly everywhere else.
      subtitle: money(row.value, row.currency),
      href: `/pipeline/${row.id}`,
    })),
    ...quoteRows.map((row) => ({
      kind: "quote" as const,
      id: row.id,
      title: row.number,
      subtitle: `${money(row.total, row.currency)} ${exclVat}`,
      href: `/quotes/${row.id}`,
    })),
    ...documentRows.map((row) => ({
      kind: "document" as const,
      id: row.id,
      title: row.number,
      subtitle: `${money(row.total, row.currency)} ${exclVat}`,
      href: `/documents/${row.id}`,
    })),
    ...conversationRows.flatMap((row) => {
      const contact = contactById.get(row.contactId);
      if (!contact) return [];
      return [
        {
          kind: "conversation" as const,
          id: row.id,
          title: contact.name,
          subtitle: contact.phone,
          href: `/inbox/${row.id}`,
        },
      ];
    }),
  ];

  return { query, hits };
}
