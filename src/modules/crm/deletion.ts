import { eq, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import {
  activities,
  aiReplies,
  contactTags,
  contacts,
  conversations,
  deals,
  documents,
  flowRuns,
  leadSubmissions,
  quotes,
  tasks,
} from "@/db/schema";
import { tenantDb, tenantTransaction } from "@/modules/tenancy/db";
import type { TenantContext } from "@/modules/tenancy/context";

// Removing a record the user created by mistake — a mistyped contact, a deal
// opened on the wrong pipeline. This is the whole of "delete" in VenderCRM,
// and it is deliberately narrow.
//
// The schema has no foreign keys (§4 — every relation is a plain char column
// carrying an id), so nothing in the database stops a delete from leaving a
// quote pointing at a contact that no longer exists. That makes an
// unconditional delete the dangerous operation, not the useful one: it can
// silently shred the history behind a number the customer already has on
// paper. So deletion is allowed only while the record has no history of its
// own, and the check runs in the same transaction as the delete.
//
// What counts as history is anything with meaning outside the record itself:
// a numbered quote or nota de venta, a WhatsApp conversation, an inbound lead
// submission, an automation run. Rows that describe *only* this record — its
// tags, its activity feed, its tasks, its AI drafts — go with it, since they
// are unreadable once it is gone. Nothing here is a soft delete: a contact
// with real history stays, and is corrected by editing it.

/** Why a record can't be deleted. Rendered as copy by the caller, so these
 * are keys rather than sentences. */
export const CONTACT_BLOCKERS = [
  "deals",
  "quotes",
  "documents",
  "conversations",
  "submissions",
  "automationRuns",
] as const;
export type ContactBlocker = (typeof CONTACT_BLOCKERS)[number];

export const DEAL_BLOCKERS = ["quotes", "documents", "submissions"] as const;
export type DealBlocker = (typeof DEAL_BLOCKERS)[number];

export class RecordDeleteError extends Error {
  constructor(
    readonly code: "notFound" | "hasHistory",
    readonly blockers: readonly string[] = [],
  ) {
    super(
      code === "notFound"
        ? "record_not_found"
        : `record_has_history:${blockers.join(",")}`,
    );
  }
}

/** Executor-agnostic so the same scan runs against `db` for the page render
 * and against the open transaction for the delete itself. */
type ScopedDb = ReturnType<typeof tenantDb>;
type TenantScopedTable = MySqlTable & { tenantId: AnyMySqlColumn };

/**
 * Existence probe rather than a count: the answer is only ever used as "is
 * this blocked", and `limit(1)` lets the index stop at the first row instead
 * of walking a contact's whole submission history to produce a number nobody
 * displays.
 */
async function exists<T extends TenantScopedTable>(
  scoped: ScopedDb,
  table: T,
  where: SQL,
): Promise<boolean> {
  const rows = await scoped.select(table, where).limit(1);
  return rows.length > 0;
}

/**
 * Probes are thunks, and are awaited one at a time. Both matter: a
 * transaction holds a single connection, so firing these off in parallel
 * would queue concurrent queries on it, and stopping at the first hit means
 * the common "nothing to delete here" answer costs one query, not six.
 */
type Probe<T extends string> = readonly [T, () => Promise<boolean>];

async function scanBlockers<T extends string>(probes: ReadonlyArray<Probe<T>>): Promise<T[]> {
  const found: T[] = [];
  for (const [name, probe] of probes) {
    if (await probe()) found.push(name);
  }
  return found;
}

function contactProbes(scoped: ScopedDb, contactId: string): ReadonlyArray<Probe<ContactBlocker>> {
  return [
    ["deals", () => exists(scoped, deals, eq(deals.contactId, contactId))],
    ["quotes", () => exists(scoped, quotes, eq(quotes.contactId, contactId))],
    ["documents", () => exists(scoped, documents, eq(documents.contactId, contactId))],
    [
      "conversations",
      () => exists(scoped, conversations, eq(conversations.contactId, contactId)),
    ],
    [
      "submissions",
      () => exists(scoped, leadSubmissions, eq(leadSubmissions.contactId, contactId)),
    ],
    ["automationRuns", () => exists(scoped, flowRuns, eq(flowRuns.contactId, contactId))],
  ];
}

function dealProbes(scoped: ScopedDb, dealId: string): ReadonlyArray<Probe<DealBlocker>> {
  return [
    ["quotes", () => exists(scoped, quotes, eq(quotes.dealId, dealId))],
    ["documents", () => exists(scoped, documents, eq(documents.dealId, dealId))],
    ["submissions", () => exists(scoped, leadSubmissions, eq(leadSubmissions.dealId, dealId))],
  ];
}

/** What the detail page asks before it decides whether to offer deletion at
 * all — an empty array means the record is deletable right now. */
export function findContactDeleteBlockers(
  ctx: TenantContext,
  contactId: string,
): Promise<ContactBlocker[]> {
  return scanBlockers(contactProbes(tenantDb(ctx), contactId));
}

export function findDealDeleteBlockers(
  ctx: TenantContext,
  dealId: string,
): Promise<DealBlocker[]> {
  return scanBlockers(dealProbes(tenantDb(ctx), dealId));
}

/**
 * Deletes a contact that has no history, along with the rows that exist only
 * to describe it. Re-scans inside the transaction rather than trusting the
 * page that rendered the button: a quote created between render and click
 * must still win.
 */
export async function deleteContactRecord(
  ctx: TenantContext,
  contactId: string,
): Promise<void> {
  await tenantTransaction(ctx, async (tx) => {
    const [contact] = await tx.select(contacts, eq(contacts.id, contactId)).limit(1);
    if (!contact) throw new RecordDeleteError("notFound");

    const blockers = await scanBlockers(contactProbes(tx, contactId));
    if (blockers.length > 0) throw new RecordDeleteError("hasHistory", blockers);

    await tx.delete(contactTags, eq(contactTags.contactId, contactId));
    await tx.delete(activities, eq(activities.contactId, contactId));
    await tx.delete(tasks, eq(tasks.contactId, contactId));
    await tx.delete(aiReplies, eq(aiReplies.contactId, contactId));
    await tx.delete(contacts, eq(contacts.id, contactId));
  });
}

/**
 * Same contract for a deal. Its activities and tasks go with it; the
 * contact's own (the ones with a null `deal_id`) are left alone, which is
 * why these deletes filter on the deal id rather than the contact's.
 */
export async function deleteDealRecord(ctx: TenantContext, dealId: string): Promise<void> {
  await tenantTransaction(ctx, async (tx) => {
    const [deal] = await tx.select(deals, eq(deals.id, dealId)).limit(1);
    if (!deal) throw new RecordDeleteError("notFound");

    const blockers = await scanBlockers(dealProbes(tx, dealId));
    if (blockers.length > 0) throw new RecordDeleteError("hasHistory", blockers);

    await tx.delete(activities, eq(activities.dealId, dealId));
    await tx.delete(tasks, eq(tasks.dealId, dealId));
    await tx.delete(deals, eq(deals.id, dealId));
  });
}
