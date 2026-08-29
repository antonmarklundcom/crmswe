import { and, eq, like, or, type SQL } from "drizzle-orm";
import { contactTags, contacts, tags } from "@/db/schema";
import { newId } from "@/lib/ids";
import { normalizePhone, DEFAULT_COUNTRY, type CountryCode } from "@/lib/phone";
import { isValidOrgNr, toTenDigits } from "@/lib/se/identity";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { crmEvents } from "./events";

// Contacts (PLAN.md §4 "crm", §5): phone (E.164) is the primary identity
// key, unique per tenant.

export { normalizePhone };

/**
 * Faktureringsuppgifter on a contact (plan.md §5.2.3). A Swedish faktura must
 * carry the buyer's name *and address*, so this is where the address gets
 * entered — but every field stays optional, because a lead captured from a
 * web form has none of them and must still become a contact. The faktura is
 * what insists on them, at issue time.
 */
export type ContactBillingInput = {
  /** Any written form; stored canonically as ten digits. */
  orgNr?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  /** ISO 3166-1 alpha-2. */
  country?: string | null;
};

export type CreateContactInput = ContactBillingInput & {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  source?: string;
  ownerUserId?: string;
};

export type UpdateContactInput = Partial<
  Omit<CreateContactInput, "phone">
> & {
  phone?: string;
};

/**
 * Normalizes and validates the billing fields.
 *
 * The org.nr is Luhn-checked at this single door and stored as ten bare
 * digits, so every reader — the invoice, a search, a dedupe — sees one
 * format. A number that fails the check is refused rather than stored: an
 * org.nr is printed on a faktura, and a wrong one there is the kind of thing
 * a customer's bookkeeper returns the invoice over.
 */
function billingValues(
  input: ContactBillingInput,
): Partial<typeof contacts.$inferInsert> {
  const values: Partial<typeof contacts.$inferInsert> = {};
  const text = (value: string | null | undefined) => {
    const trimmed = (value ?? "").trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  if (input.orgNr !== undefined) {
    const raw = text(input.orgNr);
    if (raw === null) {
      values.orgNr = null;
    } else {
      const canonical = toTenDigits(raw);
      if (canonical === null || !isValidOrgNr(raw)) throw new Error("invalid_org_nr");
      values.orgNr = canonical;
    }
  }
  if (input.addressLine1 !== undefined) values.addressLine1 = text(input.addressLine1);
  if (input.addressLine2 !== undefined) values.addressLine2 = text(input.addressLine2);
  if (input.postalCode !== undefined) values.postalCode = text(input.postalCode);
  if (input.city !== undefined) values.city = text(input.city);
  if (input.country !== undefined) {
    const country = text(input.country);
    values.country = country === null ? null : country.toUpperCase().slice(0, 2);
  }
  return values;
}

export type ListContactsFilters = {
  search?: string;
  tagId?: string;
  ownerUserId?: string;
  source?: string;
};

export async function createContact(
  ctx: TenantContext,
  input: CreateContactInput,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
) {
  const id = newId();
  const phone = normalizePhone(input.phone, defaultCountry);

  await tenantDb(ctx)
    .insert(contacts)
    .values({
      id,
      name: input.name,
      phone,
      email: input.email,
      notes: input.notes,
      source: input.source,
      ownerUserId: input.ownerUserId,
      ...billingValues(input),
    });

  await crmEvents.emit("contact.created", { tenantId: ctx.tenantId, contactId: id });

  return getContact(ctx, id);
}

export async function updateContact(
  ctx: TenantContext,
  id: string,
  input: UpdateContactInput,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
) {
  // Spread the plain fields, then let billingValues own the ones it
  // validates and canonicalizes — an unvalidated org.nr must not reach the
  // column through the generic spread.
  const { orgNr, addressLine1, addressLine2, postalCode, city, country, ...rest } = input;
  const values: Partial<typeof contacts.$inferInsert> = {
    ...rest,
    ...billingValues({ orgNr, addressLine1, addressLine2, postalCode, city, country }),
  };
  if (input.phone) values.phone = normalizePhone(input.phone, defaultCountry);

  await tenantDb(ctx).update(contacts).set(values).where(eq(contacts.id, id));
  return getContact(ctx, id);
}

export async function getContact(ctx: TenantContext, id: string) {
  const [row] = await tenantDb(ctx).select(contacts, eq(contacts.id, id));
  return row ?? null;
}

export async function getContactByPhone(
  ctx: TenantContext,
  phone: string,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
) {
  const [row] = await tenantDb(
    ctx,
  ).select(contacts, eq(contacts.phone, normalizePhone(phone, defaultCountry)));
  return row ?? null;
}

/** List with search (name/phone/email) and tag/owner/source filters (§5). */
export async function listContacts(ctx: TenantContext, filters: ListContactsFilters = {}) {
  const conditions: SQL[] = [];

  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        like(contacts.name, term),
        like(contacts.phone, term),
        like(contacts.email, term),
      ) as SQL,
    );
  }
  if (filters.ownerUserId) {
    conditions.push(eq(contacts.ownerUserId, filters.ownerUserId));
  }
  if (filters.source) {
    conditions.push(eq(contacts.source, filters.source));
  }

  if (filters.tagId) {
    const tagged = await tenantDb(ctx).select(contactTags, eq(contactTags.tagId, filters.tagId));
    const contactIds = new Set(tagged.map((row) => row.contactId));
    if (contactIds.size === 0) return [];
    // No tenantDb "IN" helper — filter in memory over the (already
    // tenant-scoped) base query rather than reaching for raw SQL.
    const base = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await tenantDb(ctx).select(contacts, base);
    return rows
      .filter((row) => contactIds.has(row.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return tenantDb(ctx)
    .select(contacts, where)
    .then((rows) => rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
}

export type CreateTagInput = { name: string; color?: string };

export async function createTag(ctx: TenantContext, input: CreateTagInput) {
  const id = newId();
  await tenantDb(ctx).insert(tags).values({ id, name: input.name, color: input.color });
  const [row] = await tenantDb(ctx).select(tags, eq(tags.id, id));
  return row ?? null;
}

export function listTags(ctx: TenantContext) {
  return tenantDb(ctx).select(tags).then((rows) => rows.sort((a, b) => a.name.localeCompare(b.name)));
}

export async function listTagsForContact(ctx: TenantContext, contactId: string) {
  const links = await tenantDb(ctx).select(contactTags, eq(contactTags.contactId, contactId));
  if (links.length === 0) return [];
  const tagIds = new Set(links.map((l) => l.tagId));
  const allTags = await listTags(ctx);
  return allTags.filter((tag) => tagIds.has(tag.id));
}

export async function addTagToContact(ctx: TenantContext, contactId: string, tagId: string) {
  const existing = await tenantDb(ctx).select(
    contactTags,
    and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagId)),
  );
  if (existing.length > 0) return;

  await tenantDb(ctx).insert(contactTags).values({ id: newId(), contactId, tagId });
  await crmEvents.emit("tag.added", { tenantId: ctx.tenantId, contactId, tagId });
}

export async function removeTagFromContact(ctx: TenantContext, contactId: string, tagId: string) {
  await tenantDb(ctx).delete(
    contactTags,
    and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagId)),
  );
}
