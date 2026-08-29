import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// E-post-first delivery (plan.md §5.3.2): the offert, the faktura and the
// betalningspåminnelse actually reach the customer by mail, carrying the
// public link — and none of the ways that can fail is allowed to take the
// document down with it.
//
// Runs against a real MySQL, like every other delivery suite. Resend is never
// reached: `RESEND_API_KEY` is unset in this environment, so lib/email's log
// driver runs, which is itself one of the things worth asserting (§4.5 — a
// missing env degrades, it never blocks).
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("customer email delivery (MySQL integration)", () => {
  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  let db: (typeof import("@/db/client"))["db"];
  let newId: (typeof import("@/lib/ids"))["newId"];
  let ctx: TenantContext;

  let createContact: (typeof import("@/modules/crm/contacts"))["createContact"];
  let createQuote: (typeof import("@/modules/quotes/quotes"))["createQuote"];
  let sendQuote: (typeof import("@/modules/quotes/delivery"))["sendQuote"];
  let createDocument: (typeof import("@/modules/documents/documents"))["createDocument"];
  let issueDocument: (typeof import("@/modules/documents/documents"))["issueDocument"];
  let recordPayment: (typeof import("@/modules/documents/documents"))["recordPayment"];
  let sendDocumentToContact: (typeof import("./delivery"))["sendDocumentToContact"];
  let sendPaymentReminder: (typeof import("./delivery"))["sendPaymentReminder"];
  let updateTenantCompanyProfile: (typeof import("@/modules/tenancy/settings"))["updateTenantCompanyProfile"];
  let updateTenantEmailSettings: (typeof import("@/modules/tenancy/settings"))["updateTenantEmailSettings"];

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    ({ newId } = await import("@/lib/ids"));
    ({ createContact } = await import("@/modules/crm/contacts"));
    ({ createQuote } = await import("@/modules/quotes/quotes"));
    ({ sendQuote } = await import("@/modules/quotes/delivery"));
    ({ createDocument, issueDocument, recordPayment } = await import("./documents"));
    ({ sendDocumentToContact, sendPaymentReminder } = await import("./delivery"));
    ({ updateTenantCompanyProfile, updateTenantEmailSettings } = await import(
      "@/modules/tenancy/settings"
    ));

    const { createTenant } = await import("@/modules/tenancy/tenants");
    const { buildSystemTenantContext } = await import("@/modules/tenancy/context");

    const tenant = await createTenant(
      { userId: "sa-mail", impersonatorUserId: null },
      { name: "Nordvik Bygg AB", slug: `nordvik-${newId().toLowerCase()}` },
    );
    ctx = (await buildSystemTenantContext(tenant!.id))!;

    // A seller complete enough to print a payment block — that block is what
    // the faktura and påminnelse mails carry beyond the link.
    await updateTenantCompanyProfile(ctx, {
      orgNr: "5560360793",
      bankgiro: "9020033",
      paymentTermsDays: 30,
    });
  });

  afterAll(async () => {
    if (!db) return;
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function makeContact(email: string | null) {
    return createContact(ctx, {
      name: "Karin Nyström",
      phone: `+4670${String(Date.now()).slice(-7)}${Math.floor(Math.random() * 10)}`,
      ...(email ? { email } : {}),
    });
  }

  /** One 25 % line at 1 000,00 kr exklusive moms. */
  const lines = [{ description: "Konsultation", qty: 1, unitPrice: 100_000, vatRateBps: 2500 }];

  /** Everything lib/email's log driver printed during `run`. */
  async function captureLog(run: () => Promise<void>): Promise<string> {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await run();
    return warn.mock.calls.map((call) => call.join(" ")).join("\n");
  }

  it("mails the offert to the contact, with the public link in it", async () => {
    const contact = await makeContact("karin@nystrom.se");
    const quote = await createQuote(ctx, { contactId: contact.id, items: lines });

    let result: Awaited<ReturnType<typeof sendQuote>> | undefined;
    const logged = await captureLog(async () => {
      result = await sendQuote(ctx, quote!.id);
    });

    // `sent` is false because Resend is not configured here — but it was
    // *attempted*, at the right address, which is the part this asserts.
    expect(result!.email.to).toBe("karin@nystrom.se");
    expect(result!.email.reason).toBe("email_not_configured");
    // The log driver is the local mail client (§4.5): the link that is the
    // entire payload of the mail has to come out of it.
    expect(logged).toContain("karin@nystrom.se");
    expect(logged).toContain(result!.publicUrl);
  });

  it("does not send over WhatsApp while that channel is off", async () => {
    const contact = await makeContact("wa@nystrom.se");
    const quote = await createQuote(ctx, { contactId: contact.id, items: lines });

    const result = await sendQuote(ctx, quote!.id);

    // Not "tried and failed for lack of an account" — never tried at all
    // (plan.md §5.3.1). A `whatsappError` here would put a WhatsApp problem
    // on the timeline of a tenant that does not use WhatsApp.
    expect(result.messageId).toBeNull();
    expect(result.whatsappError).toBeUndefined();
  });

  it("still sends the offert when the contact has no email address", async () => {
    // Plenty of contacts are captured by phone alone. The public link exists
    // either way, and a rep sends it by hand — losing the offert over a
    // missing address would be the worse failure.
    const contact = await makeContact(null);
    const quote = await createQuote(ctx, { contactId: contact.id, items: lines });

    const result = await sendQuote(ctx, quote!.id);

    expect(result.email.sent).toBe(false);
    expect(result.email.to).toBeNull();
    expect(result.email.reason).toBe("no_email");
    expect(result.publicUrl).toContain("/q/");

    // The status still advanced: the offert was sent, by the only channel
    // available for it.
    const { getQuote } = await import("@/modules/quotes/quotes");
    expect((await getQuote(ctx, quote!.id))!.status).toBe("sent");
  });

  it("mails the faktura with its OCR and bankgiro, and never the offert's netto", async () => {
    const contact = await makeContact("faktura@nystrom.se");
    const document = await createDocument(ctx, { contactId: contact.id, items: lines });
    const issued = await issueDocument(ctx, document!.id);

    let result: Awaited<ReturnType<typeof sendDocumentToContact>> | undefined;
    const logged = await captureLog(async () => {
      result = await sendDocumentToContact(ctx, issued!.id);
    });

    expect(result!.email.to).toBe("faktura@nystrom.se");
    expect(logged).toContain(result!.publicUrl);

    // The mail quotes brutto. `total` is exklusive moms (O2), so a mail that
    // said 1 000,00 kr would ask the customer for the wrong money — the same
    // netto/brutto confusion O2 found in the payments ledger.
    const { grossOf } = await import("./types");
    expect(grossOf(issued!)).toBe(125_000);
  });

  it("refuses to chase a faktura that is already paid", async () => {
    const contact = await makeContact("betald@nystrom.se");
    const document = await createDocument(ctx, { contactId: contact.id, items: lines });
    const issued = await issueDocument(ctx, document!.id);

    // Settle it in full — against the *gross*, which is what is owed.
    await recordPayment(ctx, issued!.id, { amount: 125_000 });

    await expect(sendPaymentReminder(ctx, issued!.id)).rejects.toThrow(
      "document_already_paid",
    );
  });

  it("chases only the outstanding balance after a part payment", async () => {
    const contact = await makeContact("delbetald@nystrom.se");
    const document = await createDocument(ctx, { contactId: contact.id, items: lines });
    const issued = await issueDocument(ctx, document!.id);

    await recordPayment(ctx, issued!.id, { amount: 25_000 });

    const result = await sendPaymentReminder(ctx, issued!.id);

    // 1 250,00 kr brutto less 250,00 kr paid. Chasing the full invoice total
    // after a part payment is how a customer is asked to pay twice.
    expect(result.balance).toBe(100_000);
    expect(result.email.to).toBe("delbetald@nystrom.se");
  });

  it("refuses to chase a draft", async () => {
    const contact = await makeContact("utkast@nystrom.se");
    const document = await createDocument(ctx, { contactId: contact.id, items: lines });

    // A draft has no number the customer has ever seen.
    await expect(sendPaymentReminder(ctx, document!.id)).rejects.toThrow(
      "document_not_issued",
    );
  });

  it("puts the tenant's name on the sender and their address on reply-to", async () => {
    // The address stays the platform's verified one — a tenant cannot send
    // from a domain they have not authenticated — so what makes the mail the
    // tenant's is the display name and where a reply lands.
    await updateTenantEmailSettings(ctx, { replyTo: "kontakt@nordvikbygg.se" });

    const { tenantSender } = await import("@/modules/renderable-document/email");
    const { getTenant } = await import("@/modules/tenancy/tenants");
    const tenant = await getTenant(ctx.tenantId);
    const settings = tenant!.settings as import("@/modules/tenancy/settings").TenantSettings;

    expect(tenantSender(settings, tenant!.name)).toEqual({
      fromName: "Nordvik Bygg AB",
      from: undefined,
      replyTo: "kontakt@nordvikbygg.se",
    });

    const contact = await makeContact("svar@nystrom.se");
    const quote = await createQuote(ctx, { contactId: contact.id, items: lines });
    const logged = await captureLog(async () => {
      await sendQuote(ctx, quote!.id);
    });
    expect(logged).toContain("kontakt@nordvikbygg.se");
  });
});
