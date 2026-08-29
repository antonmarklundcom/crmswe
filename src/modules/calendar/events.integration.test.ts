import { afterAll, beforeAll, describe, expect, it } from "vitest";

// What the agenda promises: everyone in the business sees it, the window
// query catches events that merely overlap it, and who may change an entry is
// decided per entry rather than per role alone. Same harness as the other
// integration suites (MySQL, no parallel files).
const hasDb = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!hasDb) return;
  const { db } = await import("@/db/client");
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
});

describe.skipIf(!hasDb)("calendar events (MySQL integration)", () => {
  let newId: (typeof import("@/lib/ids"))["newId"];
  let events: typeof import("./events");
  let agenda: typeof import("./agenda");

  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  let adminCtx: TenantContext;
  let ownerCtx: TenantContext;
  let otherAgentCtx: TenantContext;
  let assigneeCtx: TenantContext;
  let elsewhereCtx: TenantContext;

  beforeAll(async () => {
    ({ newId } = await import("@/lib/ids"));
    events = await import("./events");
    agenda = await import("./agenda");
    const { createTenant } = await import("@/modules/tenancy/tenants");

    const superadmin = { userId: "sa-cal", impersonatorUserId: null } as const;
    const tenant = await createTenant(superadmin, {
      name: `Cal ${newId()}`,
      slug: `cal-${newId()}`,
    });
    const other = await createTenant(superadmin, {
      name: `Other ${newId()}`,
      slug: `ocal-${newId()}`,
    });

    adminCtx = {
      tenantId: tenant!.id,
      userId: "admin-user",
      role: "admin",
      impersonatorUserId: null,
      accessStatus: "active",
      currency: "SEK",
    };
    ownerCtx = { ...adminCtx, userId: "agent-owner", role: "agent" };
    otherAgentCtx = { ...adminCtx, userId: "agent-other", role: "agent" };
    assigneeCtx = { ...adminCtx, userId: "agent-assignee", role: "agent" };
    elsewhereCtx = { ...adminCtx, tenantId: other!.id };
  });

  const at = (iso: string) => new Date(iso);

  async function visit(ctx: TenantContext, overrides: Partial<Parameters<
    typeof events.createCalendarEvent
  >[1]> = {}) {
    return events.createCalendarEvent(ctx, {
      title: `Visita ${newId()}`,
      startsAt: at("2026-08-25T13:00:00Z"),
      endsAt: at("2026-08-25T14:00:00Z"),
      ...overrides,
    });
  }

  it("refuses a range that ends before it starts", async () => {
    await expect(
      visit(ownerCtx, {
        startsAt: at("2026-08-25T14:00:00Z"),
        endsAt: at("2026-08-25T13:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "invalidRange" });
  });

  it("shows an agent's booking to the whole business", async () => {
    const event = await visit(ownerCtx);
    const seen = await events.listCalendarEvents(
      adminCtx,
      at("2026-08-25T00:00:00Z"),
      at("2026-08-26T00:00:00Z"),
    );
    expect(seen.map((row) => row.id)).toContain(event!.id);
  });

  it("never shows it to another business", async () => {
    const event = await visit(ownerCtx);
    const seen = await events.listCalendarEvents(
      elsewhereCtx,
      at("2026-08-25T00:00:00Z"),
      at("2026-08-26T00:00:00Z"),
    );
    expect(seen.map((row) => row.id)).not.toContain(event!.id);
    expect(await events.getCalendarEvent(elsewhereCtx, event!.id)).toBeNull();
  });

  it("finds an event that only overlaps the window", async () => {
    // Runs Monday into Wednesday; the window is Tuesday alone, which a
    // "starts inside the window" query would miss entirely.
    const event = await visit(ownerCtx, {
      startsAt: at("2026-08-24T13:00:00Z"),
      endsAt: at("2026-08-26T13:00:00Z"),
    });

    const seen = await events.listCalendarEvents(
      ownerCtx,
      at("2026-08-25T03:00:00Z"),
      at("2026-08-26T03:00:00Z"),
    );
    expect(seen.map((row) => row.id)).toContain(event!.id);
  });

  it("filters by who it is assigned to", async () => {
    const mine = await visit(ownerCtx, { assignedUserId: assigneeCtx.userId });
    const theirs = await visit(ownerCtx, { assignedUserId: "somebody-else" });

    const seen = await events.listCalendarEvents(
      adminCtx,
      at("2026-08-25T00:00:00Z"),
      at("2026-08-26T00:00:00Z"),
      { assignedUserId: assigneeCtx.userId },
    );
    expect(seen.map((row) => row.id)).toContain(mine!.id);
    expect(seen.map((row) => row.id)).not.toContain(theirs!.id);
  });

  describe("who may change an event", () => {
    it("lets the agent who created it edit and delete it", async () => {
      const event = await visit(ownerCtx);
      const updated = await events.updateCalendarEvent(ownerCtx, event!.id, {
        title: "Visita reprogramada",
      });
      expect(updated!.title).toBe("Visita reprogramada");

      await events.deleteCalendarEvent(ownerCtx, event!.id);
      expect(await events.getCalendarEvent(ownerCtx, event!.id)).toBeNull();
    });

    it("lets the agent it is assigned to change it", async () => {
      const event = await visit(ownerCtx, { assignedUserId: assigneeCtx.userId });
      const updated = await events.updateCalendarEvent(assigneeCtx, event!.id, {
        location: "Obra San Lorenzo",
      });
      expect(updated!.location).toBe("Obra San Lorenzo");
    });

    it("refuses an agent who is neither, and leaves the event alone", async () => {
      const event = await visit(ownerCtx);

      await expect(
        events.updateCalendarEvent(otherAgentCtx, event!.id, { title: "Secuestrada" }),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(events.deleteCalendarEvent(otherAgentCtx, event!.id)).rejects.toMatchObject({
        code: "forbidden",
      });

      const stored = await events.getCalendarEvent(adminCtx, event!.id);
      expect(stored!.title).toBe(event!.title);
    });

    it("lets an admin change anyone's — somebody has to clear the agenda of a rep who left", async () => {
      const event = await visit(ownerCtx);
      await events.updateCalendarEvent(adminCtx, event!.id, { title: "Reasignada" });
      await events.deleteCalendarEvent(adminCtx, event!.id);
      expect(await events.getCalendarEvent(adminCtx, event!.id)).toBeNull();
    });

    it("says notFound for an event in another business rather than forbidden", async () => {
      // The tenant predicate runs first, so a foreign id is simply not there
      // — which is the answer that leaks nothing about it existing.
      const event = await visit(ownerCtx);
      await expect(
        events.updateCalendarEvent(elsewhereCtx, event!.id, { title: "Robada" }),
      ).rejects.toMatchObject({ code: "notFound" });
    });
  });

  it("draws tasks beside events, and filters both the same way", async () => {
    const contacts = await import("@/modules/crm/contacts");
    const tasks = await import("@/modules/crm/tasks");

    const contact = await contacts.createContact(ownerCtx, {
      name: "Agenda contacto",
      phone: `0983${Math.floor(Math.random() * 900000) + 100000}`,
    });
    await tasks.createTask(ownerCtx, {
      contactId: contact!.id,
      title: "Llamar antes de la visita",
      dueAt: at("2026-09-10T13:00:00Z"),
      assignedUserId: assigneeCtx.userId,
    });
    const event = await visit(ownerCtx, {
      startsAt: at("2026-09-10T16:00:00Z"),
      endsAt: at("2026-09-10T17:00:00Z"),
      assignedUserId: assigneeCtx.userId,
    });

    const entries = await agenda.listCalendarEntries(
      adminCtx,
      at("2026-09-10T00:00:00Z"),
      at("2026-09-11T00:00:00Z"),
      { assignedUserId: assigneeCtx.userId },
    );

    expect(entries.filter((entry) => entry.kind === "task")).toHaveLength(1);
    expect(entries.filter((entry) => entry.kind === "event").map((entry) => entry.id)).toContain(
      event!.id,
    );

    // The per-rep filter has to hide both layers, not just one.
    const someoneElse = await agenda.listCalendarEntries(
      adminCtx,
      at("2026-09-10T00:00:00Z"),
      at("2026-09-11T00:00:00Z"),
      { assignedUserId: "nobody" },
    );
    expect(someoneElse).toEqual([]);
  });
});
