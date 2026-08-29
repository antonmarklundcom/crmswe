import { afterAll, beforeAll, describe, expect, it } from "vitest";

// GDPR (plan.md §5.3.3): the registerutdrag is complete, and anonymisation
// erases the person **without destroying the books**.
//
// The second half is the one worth the machinery. Bokföringslagen requires
// räkenskapsinformation to be kept seven years and GDPR Art. 17(3)(b) yields
// to exactly that, so an issued faktura — and the buyer snapshot frozen onto
// it, which *is* the record of who was invoiced — has to come through an
// erasure request untouched, while the live contact does not. Getting this
// wrong in either direction is a legal problem, not a bug, which is why the
// assertions here are on both sides of the line rather than only on the
// scrubbing.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("GDPR export and anonymisation (MySQL integration)", () => {
  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  let db: (typeof import("@/db/client"))["db"];
  let newId: (typeof import("@/lib/ids"))["newId"];
  let adminCtx: TenantContext;
  let agentCtx: TenantContext;
  let elsewhere: TenantContext;

  let createContact: (typeof import("./contacts"))["createContact"];
  let getContact: (typeof import("./contacts"))["getContact"];
  let createActivity: (typeof import("./activities"))["createActivity"];
  let exportContactData: (typeof import("./gdpr"))["exportContactData"];
  let anonymizeContact: (typeof import("./gdpr"))["anonymizeContact"];
  let ANONYMIZED_NAME: (typeof import("./gdpr"))["ANONYMIZED_NAME"];
  let createDocument: (typeof import("@/modules/documents/documents"))["createDocument"];
  let issueDocument: (typeof import("@/modules/documents/documents"))["issueDocument"];
  let getDocument: (typeof import("@/modules/documents/documents"))["getDocument"];
  let createQuote: (typeof import("@/modules/quotes/quotes"))["createQuote"];

  const lines = [{ description: "Takarbete", qty: 1, unitPrice: 400_000, vatRateBps: 2500 }];

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    ({ newId } = await import("@/lib/ids"));
    ({ createContact, getContact } = await import("./contacts"));
    ({ createActivity } = await import("./activities"));
    ({ exportContactData, anonymizeContact, ANONYMIZED_NAME } = await import("./gdpr"));
    ({ createDocument, issueDocument, getDocument } = await import(
      "@/modules/documents/documents"
    ));
    ({ createQuote } = await import("@/modules/quotes/quotes"));

    const { createTenant } = await import("@/modules/tenancy/tenants");
    const { buildSystemTenantContext } = await import("@/modules/tenancy/context");
    const { updateTenantCompanyProfile } = await import("@/modules/tenancy/settings");

    const tenant = await createTenant(
      { userId: "sa-gdpr", impersonatorUserId: null },
      { name: "Takbolaget AB", slug: `tak-${newId().toLowerCase()}` },
    );
    const other = await createTenant(
      { userId: "sa-gdpr", impersonatorUserId: null },
      { name: "Annat AB", slug: `annat-${newId().toLowerCase()}` },
    );

    const base = (await buildSystemTenantContext(tenant!.id))!;
    adminCtx = { ...base, userId: "admin-user", role: "admin" };
    agentCtx = { ...base, userId: "agent-user", role: "agent" };
    elsewhere = (await buildSystemTenantContext(other!.id))!;

    // A seller complete enough to issue a legally shaped faktura.
    await updateTenantCompanyProfile(adminCtx, {
      orgNr: "5560360793",
      bankgiro: "9020033",
    });
  });

  afterAll(async () => {
    if (!db) return;
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  });

  /** A contact with an address, so there is a buyer block to freeze. */
  async function makeCustomer(name = "Karin Nyström") {
    const { updateContact } = await import("./contacts");
    const contact = await createContact(adminCtx, {
      name,
      phone: `+46701${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 10)}`,
      email: "karin@nystrom.se",
    });
    await updateContact(adminCtx, contact.id, {
      orgNr: "5560360793",
      addressLine1: "Storgatan 1",
      postalCode: "41103",
      city: "Göteborg",
      country: "SE",
      notes: "Vill helst bli ringd på eftermiddagen.",
    });
    return contact;
  }

  // --- Registerutdrag -------------------------------------------------------

  it("returns every kind of record the tenant holds about the contact", async () => {
    const contact = await makeCustomer();
    const quote = await createQuote(adminCtx, { contactId: contact.id, items: lines });
    const document = await createDocument(adminCtx, { contactId: contact.id, items: lines });
    await issueDocument(adminCtx, document!.id);
    await createActivity(adminCtx, {
      contactId: contact.id,
      type: "note",
      payload: { text: "Ringde om taket, vill ha offert." },
      userId: adminCtx.userId,
    });

    const data = (await exportContactData(adminCtx, contact.id))!;
    expect(data).not.toBeNull();

    // The identifiers, including the ones a person is most likely to be
    // asking about.
    const exported = data.contact as Record<string, unknown>;
    expect(exported.name).toBe("Karin Nyström");
    expect(exported.email).toBe("karin@nystrom.se");
    expect(exported.orgNr).toBe("5560360793");
    expect(exported.orgNrFormatted).toBe("556036-0793");
    expect(exported.notes).toContain("eftermiddagen");

    // Every section named, so a section that quietly stops being populated
    // fails here rather than in a disclosure.
    for (const key of [
      "deals",
      "quotes",
      "documents",
      "activities",
      "tasks",
      "calendarEvents",
      "bookings",
      "leadSubmissions",
      "whatsappConversations",
      "chatConversations",
      "aiReplies",
      "automationRuns",
    ]) {
      expect(Array.isArray(data[key]), `${key} missing from the export`).toBe(true);
    }

    // Child rows travel with their parents — a registerutdrag listing an
    // invoice without its lines discloses that a transaction happened while
    // withholding what it was.
    const quotes = data.quotes as Array<{ id: string; items: unknown[] }>;
    expect(quotes.find((row) => row.id === quote!.id)!.items).toHaveLength(1);
    const documents = data.documents as Array<{
      id: string;
      items: unknown[];
      payments: unknown[];
    }>;
    const exportedDoc = documents.find((row) => row.id === document!.id)!;
    expect(exportedDoc.items).toHaveLength(1);
    expect(Array.isArray(exportedDoc.payments)).toBe(true);

    // And it says what it is, and why the invoices are in it.
    const meta = data.meta as Record<string, string>;
    expect(meta.note).toContain("bokföringslagen");
  });

  it("cannot be pointed at another tenant's contact", async () => {
    const contact = await makeCustomer();
    // A real id, a real contact — just not this tenant's. Scoped by tenantDb,
    // so the answer is "no such contact", which is the answer it should be.
    expect(await exportContactData(elsewhere, contact.id)).toBeNull();
  });

  // --- Anonymisering --------------------------------------------------------

  it("refuses without an admin, and without an explicit confirmation", async () => {
    const contact = await makeCustomer();

    await expect(
      anonymizeContact(agentCtx, contact.id, { confirm: true }),
    ).rejects.toThrow("anonymize_requires_admin");
    await expect(
      anonymizeContact(adminCtx, contact.id, { confirm: false }),
    ).rejects.toThrow("anonymize_requires_confirmation");

    // Neither refusal touched anything.
    expect((await getContact(adminCtx, contact.id))!.name).toBe("Karin Nyström");
  });

  it("scrubs the contact but leaves the issued faktura and its buyer snapshot whole", async () => {
    const contact = await makeCustomer("Erik Lindqvist");
    const document = await createDocument(adminCtx, { contactId: contact.id, items: lines });
    const issued = await issueDocument(adminCtx, document!.id);

    // What the invoice froze at issue — this is the seven-year record.
    const snapshotBefore = issued!.buyerSnapshot;
    expect(snapshotBefore).toBeTruthy();

    const result = await anonymizeContact(adminCtx, contact.id, { confirm: true });

    // The person is gone from the live record.
    const after = (await getContact(adminCtx, contact.id))!;
    expect(after.name).toBe(ANONYMIZED_NAME);
    expect(after.email).toBeNull();
    expect(after.orgNr).toBeNull();
    expect(after.addressLine1).toBeNull();
    expect(after.postalCode).toBeNull();
    expect(after.city).toBeNull();
    expect(after.notes).toBeNull();
    expect(after.phone).not.toContain("+46");
    // Still a row, and still the row the invoices point at: deleting it
    // would orphan them.
    expect(after.id).toBe(contact.id);

    // **The books survived.** The document is still there, still issued,
    // still for the same money — and the buyer block printed on it still
    // names who was invoiced, because that is what bokföringslagen requires
    // to exist for seven years.
    const documentAfter = (await getDocument(adminCtx, document!.id))!;
    expect(documentAfter.status).toBe("issued");
    expect(documentAfter.number).toBe(issued!.number);
    expect(documentAfter.total).toBe(issued!.total);
    expect(documentAfter.vatTotal).toBe(issued!.vatTotal);
    expect(documentAfter.buyerSnapshot).toEqual(snapshotBefore);

    const { parseBuyerSnapshot } = await import("@/modules/documents/types");
    const buyer = parseBuyerSnapshot(documentAfter.buyerSnapshot)!;
    expect(buyer.name).toBe("Erik Lindqvist");
    expect(buyer.addressLine1).toBe("Storgatan 1");
    expect(buyer.city).toBe("Göteborg");

    // And the receipt says so, in the shape the audit entry carries.
    expect(result.preservedDocuments).toBe(1);
    expect(result.scrubbed.contacts).toBe(1);
  });

  it("scrubs the free text of notes without erasing that the note happened", async () => {
    const contact = await makeCustomer();
    await createActivity(adminCtx, {
      contactId: contact.id,
      type: "note",
      payload: { text: "Bor granne med min bror." },
      userId: adminCtx.userId,
    });

    await anonymizeContact(adminCtx, contact.id, { confirm: true });

    const data = (await exportContactData(adminCtx, contact.id))!;
    const activities = data.activities as Array<{
      type: string;
      payload: Record<string, unknown>;
    }>;
    const note = activities.find((row) => row.type === "note")!;
    // The tenant's record that a note was taken on that date survives; what
    // it said about the person does not.
    expect(note).toBeTruthy();
    expect(note.payload.text).toBe("");
  });

  it("writes an audit entry saying what was scrubbed and what was kept", async () => {
    const contact = await makeCustomer();
    const document = await createDocument(adminCtx, { contactId: contact.id, items: lines });
    await issueDocument(adminCtx, document!.id);

    await anonymizeContact(adminCtx, contact.id, { confirm: true });

    const { listAuditLogForTenant } = await import("@/modules/tenancy/audit");
    const entries = await listAuditLogForTenant(adminCtx.tenantId, 50);
    const entry = entries.find(
      (row) => row.action === "contact.anonymized" && row.entityId === contact.id,
    )!;

    expect(entry).toBeTruthy();
    expect(entry.actorUserId).toBe("admin-user");
    const payload = entry.payload as Record<string, unknown>;
    expect(payload.preservedDocuments).toBe(1);
    // Why the invoices are still there, recorded beside the act rather than
    // left to whoever reads the log years later to remember.
    expect(payload.retention).toBe("bokforingslagen_7y");
  });

  it("is idempotent enough to run twice without failing", async () => {
    // A tenant handling the same request twice, or clicking through a stale
    // page, must not get an error that suggests something is broken.
    const contact = await makeCustomer();
    await anonymizeContact(adminCtx, contact.id, { confirm: true });
    const second = await anonymizeContact(adminCtx, contact.id, { confirm: true });

    expect(second.contactId).toBe(contact.id);
    expect((await getContact(adminCtx, contact.id))!.name).toBe(ANONYMIZED_NAME);
  });
});
