import { eq, inArray } from "drizzle-orm";
import {
  activities,
  aiReplies,
  bookings,
  calendarEvents,
  chatConversations,
  chatMessages,
  contactTags,
  contacts,
  conversations,
  deals,
  documentItems,
  documentPayments,
  documents,
  flowRuns,
  leadSubmissions,
  messages,
  quoteItems,
  quotes,
  tags,
  tasks,
} from "@/db/schema";
import { tenantDb, tenantTransaction } from "@/modules/tenancy/db";
import { writeAuditLog } from "@/modules/tenancy/audit";
import type { TenantContext } from "@/modules/tenancy/context";
import { formatOrgNr } from "@/lib/se/identity";

// GDPR: registerutdrag and anonymisering (plan.md §5.3.3;
// sweden-business-apps §5). The two rights a Swedish tenant will actually be
// asked to honour, and the one place in this codebase that has to hold both
// of them at once:
//
//   **Article 15** — a person may ask what you hold about them, and get all
//   of it. So the export walks every tenant-scoped table that references the
//   contact, not the handful a screen happens to show.
//
//   **Article 17** — a person may ask you to erase it. But erasure yields to
//   a legal retention obligation (Art. 17(3)(b)), and in Sweden bokförings-
//   lagen requires räkenskapsinformation to be kept **seven years**. An
//   issued faktura is räkenskapsinformation. So it is never deleted, and its
//   frozen buyer_snapshot is never scrubbed: that snapshot *is* the record,
//   and a "who was this invoiced to" that answers nobody is a bookkeeping
//   record that has been destroyed, whatever the row count says.
//
// Those two pull in opposite directions and the resolution is deliberate:
// **anonymise the live contact and the person's own words; leave the fiscal
// record alone.** `anonymizeContact` below says exactly which side of that
// line every table falls on, and why.
//
// This sits beside ./deletion.ts, which is the other half of the same
// subject. Deletion there is narrow on purpose — a record with history stays.
// Anonymisation is what answers an erasure request for the contact that
// deletion refuses, and refusing both would leave a tenant with no lawful
// answer at all.

// --- Registerutdrag (Article 15) --------------------------------------------

export type ContactExport = Record<string, unknown>;

/**
 * Everything this tenant holds about one contact, as plain JSON.
 *
 * Deliberately raw rows rather than a curated view. A registerutdrag is not
 * a report — the person is entitled to the data, not to our summary of it,
 * and a hand-picked projection is exactly how a field quietly goes missing
 * from a disclosure. New columns therefore appear in the export the day they
 * are added, without anyone remembering to add them here.
 *
 * Child rows are nested under their parents (items under a quote, messages
 * under a conversation) so the document is readable, and every list is
 * fetched through `tenantDb`, so nothing from another tenant can appear in
 * it however the ids are shaped.
 */
export async function exportContactData(
  ctx: TenantContext,
  contactId: string,
): Promise<ContactExport | null> {
  const scoped = tenantDb(ctx);

  const [contact] = await scoped.select(contacts, eq(contacts.id, contactId)).limit(1);
  if (!contact) return null;

  const [
    contactTagRows,
    dealRows,
    quoteRows,
    documentRows,
    activityRows,
    taskRows,
    eventRows,
    bookingRows,
    submissionRows,
    conversationRows,
    chatConversationRows,
    aiReplyRows,
    flowRunRows,
  ] = await Promise.all([
    scoped.select(contactTags, eq(contactTags.contactId, contactId)),
    scoped.select(deals, eq(deals.contactId, contactId)),
    scoped.select(quotes, eq(quotes.contactId, contactId)),
    scoped.select(documents, eq(documents.contactId, contactId)),
    scoped.select(activities, eq(activities.contactId, contactId)),
    scoped.select(tasks, eq(tasks.contactId, contactId)),
    scoped.select(calendarEvents, eq(calendarEvents.contactId, contactId)),
    scoped.select(bookings, eq(bookings.contactId, contactId)),
    scoped.select(leadSubmissions, eq(leadSubmissions.contactId, contactId)),
    scoped.select(conversations, eq(conversations.contactId, contactId)),
    scoped.select(chatConversations, eq(chatConversations.contactId, contactId)),
    scoped.select(aiReplies, eq(aiReplies.contactId, contactId)),
    scoped.select(flowRuns, eq(flowRuns.contactId, contactId)),
  ]);

  // Tag *names*, not just the join rows: "this person is tagged 0J7X…" is
  // not a disclosure of anything.
  const tagIds = contactTagRows.map((row) => row.tagId);
  const tagRows = tagIds.length
    ? await scoped.select(tags, inArray(tags.id, tagIds))
    : [];

  const [quoteItemRows, documentItemRows, paymentRows, messageRows, chatMessageRows] =
    await Promise.all([
      childrenOf(scoped, quoteItems, quoteItems.quoteId, quoteRows),
      childrenOf(scoped, documentItems, documentItems.documentId, documentRows),
      childrenOf(scoped, documentPayments, documentPayments.documentId, documentRows),
      childrenOf(scoped, messages, messages.conversationId, conversationRows),
      childrenOf(
        scoped,
        chatMessages,
        chatMessages.chatConversationId,
        chatConversationRows,
      ),
    ]);

  return {
    // What this document is, in the file itself: a registerutdrag that
    // arrives as a bare array of rows is one the recipient cannot read, and
    // the retention note is the honest answer to "why is my invoice still
    // here" before they have to ask it.
    meta: {
      generatedAt: new Date().toISOString(),
      tenantId: ctx.tenantId,
      contactId,
      note:
        "Registerutdrag enligt artikel 15 GDPR. Innehåller alla uppgifter " +
        "denna organisation lagrar om kontakten. Utställda fakturor sparas i " +
        "sju år enligt bokföringslagen och kan därför inte raderas.",
    },
    contact: {
      ...contact,
      // Stored canonically as ten digits; shown the way it is written.
      orgNrFormatted: contact.orgNr ? formatOrgNr(contact.orgNr) : null,
    },
    tags: tagRows,
    deals: dealRows,
    quotes: nest(quoteRows, quoteItemRows, "quoteId", "items"),
    documents: nest(
      nest(documentRows, documentItemRows, "documentId", "items"),
      paymentRows,
      "documentId",
      "payments",
    ),
    activities: activityRows,
    tasks: taskRows,
    calendarEvents: eventRows,
    bookings: bookingRows,
    leadSubmissions: submissionRows,
    whatsappConversations: nest(
      conversationRows,
      messageRows,
      "conversationId",
      "messages",
    ),
    chatConversations: nest(
      chatConversationRows,
      chatMessageRows,
      "chatConversationId",
      "messages",
    ),
    aiReplies: aiReplyRows,
    automationRuns: flowRunRows,
  };
}

type ScopedDb = ReturnType<typeof tenantDb>;

/** Child rows for a set of parents, in one query rather than one per parent —
 * a contact with two hundred messages must not cost two hundred statements. */
async function childrenOf<T extends Parameters<ScopedDb["select"]>[0]>(
  scoped: ScopedDb,
  table: T,
  column: Parameters<typeof inArray>[0],
  parents: Array<{ id: string }>,
) {
  if (parents.length === 0) return [];
  return scoped.select(table, inArray(column, parents.map((parent) => parent.id)));
}

/** Attaches each child to its parent under `key`. */
function nest<P extends { id: string }, C extends Record<string, unknown>>(
  parents: P[],
  children: C[],
  foreignKey: keyof C,
  key: string,
): Array<P & Record<string, C[]>> {
  const byParent = new Map<unknown, C[]>();
  for (const child of children) {
    const parentId = child[foreignKey];
    const bucket = byParent.get(parentId);
    if (bucket) bucket.push(child);
    else byParent.set(parentId, [child]);
  }
  return parents.map(
    (parent) => ({ ...parent, [key]: byParent.get(parent.id) ?? [] }) as P & Record<string, C[]>,
  );
}

// --- Anonymisering (Article 17, against bokföringslagen's seven years) -------

export type AnonymizeResult = {
  contactId: string;
  /** What the contact is called afterwards, so the UI can say so. */
  anonymizedName: string;
  /** Rows touched, per table — the receipt for the audit entry. */
  scrubbed: Record<string, number>;
  /** Issued documents deliberately left whole. Never zero-by-accident: this
   * is the number the tenant can point at when asked what they kept. */
  preservedDocuments: number;
};

/**
 * The word an admin types to confirm anonymisation.
 *
 * A literal rather than a translated string, and shown to the admin as a
 * literal too: if the word followed the UI language, an admin reading the
 * English UI would be asked for one word while the server checked for
 * another. Compared case- and space-insensitively — it is a speed bump
 * against a mis-click, not a password.
 */
export const ANONYMIZE_CONFIRM_WORD = "anonymisera";

/** What a scrubbed contact is called. Not a blank: an empty name renders as
 * an empty row in every list and reads as data corruption rather than as a
 * deliberate act. */
export const ANONYMIZED_NAME = "Anonymiserad kontakt";

/**
 * Answers an erasure request without breaking the books.
 *
 * **Scrubbed** — the identifiers on the live contact, and the content the
 * person themselves produced or that quotes them: message bodies on both
 * channels, the payload of forms they filled in, AI drafts written about
 * them, and the free text of notes. None of that is räkenskapsinformation
 * and none of it has a retention obligation behind it.
 *
 * **Kept** — the fiscal and commercial skeleton: every document row, its
 * items, its payments, its number, its dates, its amounts, and above all its
 * frozen `buyer_snapshot`. Bokföringslagen requires seven years, GDPR Art.
 * 17(3)(b) yields to exactly that, and an invoice whose buyer has been
 * blanked is not an anonymised invoice — it is a destroyed one. Deals,
 * quotes and their items stay for the same reason one step down: they are
 * the tenant's record of a transaction, identified now only by an id.
 *
 * Requires an admin *and* an explicit confirmation, and writes an audit entry
 * either way — this is irreversible, and "who anonymised this customer, and
 * when" is a question a tenant will eventually have to answer.
 *
 * One transaction: a half-anonymised contact — name gone, messages still
 * quoting them by it — is worse than either outcome.
 */
export async function anonymizeContact(
  ctx: TenantContext,
  contactId: string,
  options: { confirm: boolean },
): Promise<AnonymizeResult> {
  if (ctx.role !== "admin") throw new Error("anonymize_requires_admin");
  // Not ceremony: the button is one click from a contact page and there is no
  // undo. The caller has to have *meant* it.
  if (!options.confirm) throw new Error("anonymize_requires_confirmation");

  const result = await tenantTransaction(ctx, async (tx) => {
    const [contact] = await tx.select(contacts, eq(contacts.id, contactId)).limit(1);
    if (!contact) throw new Error("contact_not_found");

    const scrubbed: Record<string, number> = {};
    // mysql2 hands an UPDATE back as `[ResultSetHeader, null]`, and the field
    // is `affectedRows` — rows *matched*, which is what "we scrubbed this
    // many" means here. Drizzle does not narrow the type for MySQL, hence the
    // cast; a shape that ever stops matching records a zero rather than
    // throwing, and the audit entry is a receipt, not a control.
    const count = (table: string, result: unknown) => {
      const affected =
        (result as [{ affectedRows?: number }, unknown] | undefined)?.[0]?.affectedRows ?? 0;
      if (affected > 0) scrubbed[table] = (scrubbed[table] ?? 0) + affected;
    };

    // The phone column is unique per tenant, so the placeholder has to be
    // too — and it has to stay a plausible-shaped value, because the same
    // column is the contact's identity key everywhere else. The contact's own
    // id is the only thing guaranteed unique and already non-personal.
    const suffix = contactId.slice(-10).toLowerCase();

    count(
      "contacts",
      await tx
        .update(contacts)
        .set({
          name: ANONYMIZED_NAME,
          phone: `anon-${suffix}`,
          email: null,
          orgNr: null,
          addressLine1: null,
          addressLine2: null,
          postalCode: null,
          city: null,
          // Country is not personal data on its own and keeps the row's moms
          // treatment readable next to the invoices that survive.
          notes: null,
          // Custom fields are tenant-defined and unknowable from here, so the
          // only safe assumption is that they hold personal data.
          custom: {},
          firstTouchUtm: null,
        })
        .where(eq(contacts.id, contactId)),
    );

    // Their own words, on both channels. Media is dropped with them: a photo
    // a customer sent is personal data as surely as a sentence is, and the
    // storage object it points at is unreachable once the key is gone.
    const conversationRows = await tx.select(
      conversations,
      eq(conversations.contactId, contactId),
    );
    if (conversationRows.length > 0) {
      count(
        "messages",
        await tx
          .update(messages)
          .set({ body: null, mediaId: null, storageKey: null })
          .where(
            inArray(
              messages.conversationId,
              conversationRows.map((row) => row.id),
            ),
          ),
      );
    }

    const chatRows = await tx.select(
      chatConversations,
      eq(chatConversations.contactId, contactId),
    );
    if (chatRows.length > 0) {
      count(
        "chat_messages",
        await tx
          .update(chatMessages)
          .set({ body: null })
          .where(
            inArray(
              chatMessages.chatConversationId,
              chatRows.map((row) => row.id),
            ),
          ),
      );
    }

    // A form submission is the person's own input, verbatim, plus the IP and
    // user-agent of the device they sent it from. The attribution that makes
    // the row worth keeping — which site, which campaign, when — is not
    // personal and stays, so the tenant's lead reporting does not develop a
    // hole where this person used to be.
    count(
      "lead_submissions",
      await tx
        .update(leadSubmissions)
        .set({ payload: {}, notes: null, ipAddress: null, userAgent: null })
        .where(eq(leadSubmissions.contactId, contactId)),
    );

    // Drafts a model wrote about them, prompt included — the prompt is the
    // conversation restated, so scrubbing only the body would leave the
    // whole exchange sitting in the audit column beside it.
    count(
      "ai_replies",
      await tx
        .update(aiReplies)
        .set({ body: null, prompt: "" })
        .where(eq(aiReplies.contactId, contactId)),
    );

    // Free text a rep typed about them. The *shape* of the timeline survives
    // — that a call happened on the 4th, that a stage changed — because that
    // is the tenant's own record of what they did, and it names nobody once
    // the text is gone.
    const activityRows = await tx.select(
      activities,
      eq(activities.contactId, contactId),
    );
    for (const activity of activityRows) {
      const payload = (activity.payload ?? {}) as Record<string, unknown>;
      const cleaned = scrubActivityPayload(payload);
      if (cleaned) {
        await tx
          .update(activities)
          .set({ payload: cleaned })
          .where(eq(activities.id, activity.id));
        scrubbed.activities = (scrubbed.activities ?? 0) + 1;
      }
    }

    // A task's title is "Ring Karin om taket" — their name, in a column. It
    // is the only free text a task has; the due date and assignee are the
    // tenant's own scheduling and name nobody.
    count(
      "tasks",
      await tx
        .update(tasks)
        .set({ title: ANONYMIZED_NAME })
        .where(eq(tasks.contactId, contactId)),
    );

    // Same for an appointment: title, where they live, and what it was about.
    count(
      "calendar_events",
      await tx
        .update(calendarEvents)
        .set({ title: ANONYMIZED_NAME, location: null, description: null })
        .where(eq(calendarEvents.contactId, contactId)),
    );

    // Booking answers are free text the visitor typed; the slot itself is
    // the tenant's own schedule and stays.
    count(
      "bookings",
      await tx
        .update(bookings)
        .set({ answers: null, ipAddress: null, userAgent: null, cancelReason: null })
        .where(eq(bookings.contactId, contactId)),
    );

    // Counted, never touched. This is the number that makes the whole
    // operation defensible in both directions at once: the person was
    // erased, and the books were not.
    const documentRows = await tx.select(documents, eq(documents.contactId, contactId));
    const preservedDocuments = documentRows.filter(
      (row) => row.status === "issued",
    ).length;

    return {
      contactId,
      anonymizedName: ANONYMIZED_NAME,
      scrubbed,
      preservedDocuments,
    } satisfies AnonymizeResult;
  });

  // Outside the transaction: the audit log is a platform table, and an entry
  // that rolls back with the thing it records is not an audit trail.
  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    impersonatorUserId: ctx.impersonatorUserId,
    action: "contact.anonymized",
    entity: "contact",
    entityId: contactId,
    payload: {
      scrubbed: result.scrubbed,
      preservedDocuments: result.preservedDocuments,
      // Why the invoices are still there, recorded next to the act itself —
      // so the answer does not depend on someone remembering this rule.
      retention: "bokforingslagen_7y",
    },
  });

  return result;
}

/** Free-text keys an activity payload can carry. Everything else in there is
 * structure — ids, amounts, stage names, delivery flags — which names nobody. */
const ACTIVITY_TEXT_KEYS = ["text", "note", "body", "message", "caption", "title"] as const;

/**
 * Strips the free text out of one activity payload, or returns null when
 * there was none — so an unchanged row is not rewritten, and the count in the
 * audit entry means "rows that actually held text about this person".
 */
function scrubActivityPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  let changed = false;
  const next = { ...payload };
  for (const key of ACTIVITY_TEXT_KEYS) {
    if (typeof next[key] === "string" && next[key] !== "") {
      next[key] = "";
      changed = true;
    }
  }
  return changed ? next : null;
}
