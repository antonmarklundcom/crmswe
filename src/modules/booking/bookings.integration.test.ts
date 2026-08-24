import { afterAll, beforeAll, describe, expect, it } from "vitest";

// What a booking promises end to end (docs/SPEC-BOOKING.md §9): one public
// reservation produces a contact, an agenda entry and a bookings row; a slot
// can be taken exactly once; cancelling frees it and clears the agenda; and
// none of it is visible to another business (PLAN.md §3.3 layer 3).
//
// Same harness as the other integration suites: MySQL, no parallel files.
const hasDb = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!hasDb) return;
  const { db } = await import("@/db/client");
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
});

describe.skipIf(!hasDb)("bookings (MySQL integration)", () => {
  type TenantContext = import("@/modules/tenancy/context").TenantContext;

  let newId: (typeof import("@/lib/ids"))["newId"];
  let bookingsModule: typeof import("./bookings");
  let typesModule: typeof import("./types");
  let resourcesModule: typeof import("./resources");
  let publicModule: typeof import("./public");

  let ctx: TenantContext;
  let elsewhere: TenantContext;
  let tenantSlug: string;
  let resourceId: string;

  // A Monday, in Asunción's own time. 09:00 local is 12:00Z.
  const MONDAY = "2026-09-07";
  const at = (iso: string) => new Date(iso);
  const NOW = at("2026-09-01T12:00:00Z");

  beforeAll(async () => {
    ({ newId } = await import("@/lib/ids"));
    bookingsModule = await import("./bookings");
    typesModule = await import("./types");
    resourcesModule = await import("./resources");
    publicModule = await import("./public");

    const { createTenant } = await import("@/modules/tenancy/tenants");
    const superadmin = { userId: "sa-booking", impersonatorUserId: null } as const;

    tenantSlug = `bk-${newId().toLowerCase()}`;
    const tenant = await createTenant(superadmin, { name: `Bk ${newId()}`, slug: tenantSlug });
    const other = await createTenant(superadmin, {
      name: `Other ${newId()}`,
      slug: `obk-${newId().toLowerCase()}`,
    });

    ctx = {
      tenantId: tenant!.id,
      userId: "admin-user",
      role: "admin",
      impersonatorUserId: null,
      accessStatus: "active",
    };
    elsewhere = { ...ctx, tenantId: other!.id };

    const resource = await resourcesModule.createResource(ctx, {
      kind: "user",
      userId: "rep-one",
      name: "Ana",
    });
    resourceId = resource!.id;

    // 08:00–12:00 local, Monday only.
    await resourcesModule.replaceAvailabilityRules(ctx, resourceId, [
      { weekday: 1, start: "08:00", end: "12:00" },
    ]);
  });

  async function makeType(overrides: Partial<Parameters<typeof typesModule.createBookingType>[1]> = {}) {
    const type = await typesModule.createBookingType(ctx, {
      name: `Consulta ${newId()}`,
      slug: `c-${newId().toLowerCase()}`,
      durationMinutes: 30,
      minNoticeMinutes: 0,
      maxAdvanceDays: 365,
      ...overrides,
    });
    await resourcesModule.setResourcesForType(ctx, type!.id, [resourceId]);
    return type!;
  }

  function reserveInput(startsAt: Date, overrides: Record<string, unknown> = {}) {
    return {
      bookingTypeId: "",
      startsAt,
      name: "Ana Giménez",
      phone: `+59598${Math.floor(1000000 + Math.random() * 8999999)}`,
      ...overrides,
    };
  }

  it("offers the availability window as slots", async () => {
    const type = await makeType();
    const slots = await bookingsModule.availableSlots(ctx, type, MONDAY, MONDAY, NOW);
    expect(slots).toHaveLength(8); // 08:00–12:00 in 30-minute steps
    expect(slots[0].startsAt.toISOString()).toBe("2026-09-07T11:00:00.000Z");
  });

  it("writes a contact, an agenda entry and a booking in one reservation", async () => {
    const type = await makeType();
    const result = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(at("2026-09-07T11:00:00.000Z")), bookingTypeId: type.id },
      NOW,
    );

    expect(result.contactId).toBeTruthy();
    // Off by default: a service appointment is not automatically a sale.
    expect(result.dealId).toBeNull();

    const { getCalendarEvent } = await import("@/modules/calendar/events");
    const event = await getCalendarEvent(ctx, result.booking.calendarEventId!);
    expect(event).not.toBeNull();
    expect(event!.startsAt.toISOString()).toBe("2026-09-07T11:00:00.000Z");
    // The rep's own agenda, which is what makes the busy check honest.
    expect(event!.assignedUserId).toBe("rep-one");

    const { listActivitiesForContact } = await import("@/modules/crm/activities");
    const timeline = await listActivitiesForContact(ctx, result.contactId);
    expect(timeline.some((row) => row.type === "booking")).toBe(true);
  });

  it("opens a deal when the type asks for one", async () => {
    // createTenant does not seed a pipeline, so this suite makes its own —
    // the same helper a new tenant gets from the onboarding path.
    const { seedDefaultPipeline, listStagesForPipeline } = await import(
      "@/modules/crm/pipelines"
    );
    const pipeline = await seedDefaultPipeline(ctx);
    const [stage] = await listStagesForPipeline(ctx, pipeline!.id);

    const type = await makeType({
      createDeal: true,
      defaultPipelineId: pipeline!.id,
      defaultStageId: stage.id,
    });

    const result = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(at("2026-09-07T11:30:00.000Z")), bookingTypeId: type.id },
      NOW,
    );
    expect(result.dealId).not.toBeNull();
  });

  it("stops the same slot being taken twice", async () => {
    const type = await makeType();
    const slot = at("2026-09-14T11:00:00.000Z"); // the next Monday

    await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(slot), bookingTypeId: type.id },
      NOW,
    );

    await expect(
      bookingsModule.reserveBooking(
        ctx,
        { ...reserveInput(slot), bookingTypeId: type.id },
        NOW,
      ),
    ).rejects.toMatchObject({ code: expect.stringMatching(/slot(Taken|Unavailable)/) });
  });

  it("refuses a start time that was never on offer", async () => {
    const type = await makeType();
    // 03:00 local — outside the availability window, and posted by hand.
    await expect(
      bookingsModule.reserveBooking(
        ctx,
        { ...reserveInput(at("2026-09-07T06:00:00.000Z")), bookingTypeId: type.id },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "slotUnavailable" });
  });

  it("blocks a slot against a calendar event the booking system never created", async () => {
    const type = await makeType();
    const { createCalendarEvent } = await import("@/modules/calendar/events");
    await createCalendarEvent(ctx, {
      title: "Visita propia",
      startsAt: at("2026-09-21T11:00:00.000Z"),
      endsAt: at("2026-09-21T11:30:00.000Z"),
      assignedUserId: "rep-one",
    });

    const slots = await bookingsModule.availableSlots(ctx, type, "2026-09-21", "2026-09-21", NOW);
    expect(slots.map((slot) => slot.startsAt.toISOString())).not.toContain(
      "2026-09-21T11:00:00.000Z",
    );
  });

  it("frees the slot and clears the agenda when cancelled", async () => {
    const type = await makeType();
    const slot = at("2026-09-28T11:00:00.000Z");

    const first = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(slot), bookingTypeId: type.id },
      NOW,
    );

    const cancelled = await bookingsModule.cancelBooking(ctx, first.booking.id, "staff", "test", NOW);
    expect(cancelled!.status).toBe("cancelled");
    expect(cancelled!.activeSlot).toBeNull();

    const { getCalendarEvent } = await import("@/modules/calendar/events");
    expect(await getCalendarEvent(ctx, first.booking.calendarEventId!)).toBeNull();

    // Bookable again, with nothing to clean up.
    const second = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(slot), bookingTypeId: type.id },
      NOW,
    );
    expect(second.booking.id).not.toBe(first.booking.id);
  });

  it("holds the visitor to the cancellation cutoff but never staff", async () => {
    const type = await makeType({ settings: { cancellationCutoffMinutes: 120 } });
    const slot = at("2026-10-05T11:00:00.000Z");
    const result = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(slot), bookingTypeId: type.id },
      NOW,
    );

    // 08:55 for a 09:00 slot: inside the cutoff.
    const tooLate = at("2026-10-05T10:55:00.000Z");
    await expect(
      bookingsModule.cancelBooking(ctx, result.booking.id, "contact", undefined, tooLate),
    ).rejects.toMatchObject({ code: "cutoffPassed" });

    const byStaff = await bookingsModule.cancelBooking(
      ctx,
      result.booking.id,
      "staff",
      undefined,
      tooLate,
    );
    expect(byStaff!.status).toBe("cancelled");
  });

  it("chains a reschedule instead of mutating the row", async () => {
    const type = await makeType();
    const first = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(at("2026-10-12T11:00:00.000Z")), bookingTypeId: type.id },
      NOW,
    );

    const moved = await bookingsModule.rescheduleBooking(
      ctx,
      first.booking.id,
      at("2026-10-12T11:30:00.000Z"),
      "contact",
      NOW,
    );

    expect(moved.booking.rescheduledFromId).toBe(first.booking.id);
    expect(moved.contactId).toBe(first.contactId);
    const original = await bookingsModule.getBooking(ctx, first.booking.id);
    expect(original!.status).toBe("cancelled");
  });

  it("marks a no-show only when a human says so", async () => {
    const type = await makeType();
    const result = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(at("2026-10-19T11:00:00.000Z")), bookingTypeId: type.id },
      NOW,
    );

    const { completePastBookings } = await import("./jobs");
    // The sweep is well past the appointment and still must not guess.
    await completePastBookings(ctx.tenantId, at("2026-10-20T00:00:00.000Z"));
    expect((await bookingsModule.getBooking(ctx, result.booking.id))!.status).toBe("completed");

    const flagged = await bookingsModule.markNoShow(ctx, result.booking.id);
    expect(flagged!.status).toBe("no_show");
  });

  it("never leaks a booking to another business", async () => {
    const type = await makeType();
    const result = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(at("2026-10-26T11:00:00.000Z")), bookingTypeId: type.id },
      NOW,
    );

    expect(await bookingsModule.getBooking(elsewhere, result.booking.id)).toBeNull();
    expect(await typesModule.getBookingType(elsewhere, type.id)).toBeNull();
    expect(
      (await bookingsModule.listBookings(elsewhere)).map((row) => row.id),
    ).not.toContain(result.booking.id);
    await expect(
      bookingsModule.cancelBooking(elsewhere, result.booking.id, "staff"),
    ).rejects.toMatchObject({ code: "notFound" });
  });

  it("answers 404 for an unknown manage token, never a hint", async () => {
    expect(await publicModule.getPublicBooking("nope-not-a-token")).toBeNull();
    const outcome = await publicModule.publicCancel("nope-not-a-token", undefined, "1.2.3.4");
    expect(outcome).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses a public reservation on a paused type", async () => {
    const type = await makeType();
    await typesModule.updateBookingType(ctx, type.id, {
      name: type.name,
      slug: type.slug,
      durationMinutes: type.durationMinutes,
      isActive: false,
    });

    const outcome = await publicModule.publicReserve(
      tenantSlug,
      type.slug,
      { startsAt: "2026-11-02T11:00:00.000Z", name: "Ana", phone: "+595981000111" },
      {},
      NOW,
    );
    expect(outcome).toMatchObject({ ok: false, status: 404 });
  });

  it("returns start times and nothing about the team", async () => {
    const type = await makeType();
    const outcome = await publicModule.publicSlots(
      tenantSlug,
      type.slug,
      MONDAY,
      MONDAY,
      "9.9.9.9",
      NOW,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.length).toBeGreaterThan(0);
    for (const slot of outcome.data) {
      expect(Object.keys(slot)).toEqual(["startsAt"]);
    }
  });

  it("drops a honeypot submission without writing anything", async () => {
    const type = await makeType();
    const before = await bookingsModule.listBookings(ctx);
    const outcome = await publicModule.publicReserve(
      tenantSlug,
      type.slug,
      {
        startsAt: "2026-11-09T11:00:00.000Z",
        name: "Bot",
        phone: "+595981000222",
        _hp: "filled",
      },
      {},
      NOW,
    );
    expect(outcome.ok).toBe(false);
    expect(await bookingsModule.listBookings(ctx)).toHaveLength(before.length);
  });
});
