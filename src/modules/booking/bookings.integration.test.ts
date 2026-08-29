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
      currency: "SEK",
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

  /** Lead submissions attached to one contact, straight from the table —
   * "did a reschedule write a second one" has no service-level question. */
  async function submissionCount(contactId: string): Promise<number> {
    const { db } = await import("@/db/client");
    const { leadSubmissions } = await import("@/db/schema");
    const { eq: equals } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(leadSubmissions)
      .where(equals(leadSubmissions.contactId, contactId));
    return rows.length;
  }

  /** Every automation trigger enqueued for this tenant, oldest first. The
   * triggers module enqueues rather than running inline, so the jobs table is
   * where "did a flow fire" is actually answerable. */
  async function triggerTypesFired(): Promise<string[]> {
    const { db } = await import("@/db/client");
    const { jobs } = await import("@/db/schema");
    const { and: all, eq: equals } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(jobs)
      .where(all(equals(jobs.tenantId, ctx.tenantId), equals(jobs.type, "automation.trigger")));
    return rows
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => String((row.payload as { triggerType?: string }).triggerType));
  }

  it("offers the availability window as slots", async () => {
    const type = await makeType();
    const slots = await bookingsModule.availableSlots(ctx, type, MONDAY, MONDAY, NOW);
    expect(slots).toHaveLength(8); // 08:00–12:00 in 30-minute steps
    expect(slots[0].startsAt.toISOString()).toBe("2026-09-07T11:00:00.000Z");
  });

  it("closes the whole day the /booking form's date range describes", async () => {
    // The form posts two dates in the tenant's own time; the action resolves
    // the end as midnight *after* the last day, so the day an admin typed is
    // itself closed. That arithmetic is what this pins — a blackout ending at
    // 00:00 of the same day would close nothing at all.
    const { zonedTimeToUtc, addDays } = await import("@/modules/calendar/zoned-time");
    const timeZone = "America/Asuncion";
    const type = await makeType();

    const blackout = await resourcesModule.createBlackout(ctx, {
      resourceId: null, // the whole business, the way a holiday works
      startsAt: zonedTimeToUtc(MONDAY, "00:00", timeZone),
      endsAt: zonedTimeToUtc(addDays(MONDAY, 1), "00:00", timeZone),
      reason: "Feriado",
    });

    expect(await bookingsModule.availableSlots(ctx, type, MONDAY, MONDAY, NOW)).toEqual([]);

    // An afternoon off, not a whole day: the morning survives it.
    await resourcesModule.deleteBlackout(ctx, blackout!.id);
    const afternoon = await resourcesModule.createBlackout(ctx, {
      resourceId,
      startsAt: zonedTimeToUtc(MONDAY, "10:00", timeZone),
      endsAt: zonedTimeToUtc(MONDAY, "12:00", timeZone),
    });

    const remaining = await bookingsModule.availableSlots(ctx, type, MONDAY, MONDAY, NOW);
    expect(remaining).toHaveLength(4); // 08:00–10:00 in 30-minute steps
    expect(remaining.at(-1)!.startsAt.toISOString()).toBe("2026-09-07T12:30:00.000Z");

    // Every other case in this file books the same Monday, so the closure
    // does not outlive the test that made it.
    await resourcesModule.deleteBlackout(ctx, afternoon!.id);
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

  it("lets exactly one of two genuinely concurrent overlapping reserves win", async () => {
    // The sequential case above never exercised the race it is named for: by
    // the time the second reserve runs, the first is committed and the plain
    // clash check catches it. This one fires both at once on two connections,
    // over *overlapping but not identical* starts, so the unique index on
    // `active_slot` cannot help either. Before the resource row lock the two
    // transactions took compatible gap locks on an empty day, both passed the
    // clash check, and the inserts deadlocked — ER_LOCK_DEADLOCK out of the
    // service as a 500 where the visitor was promised a 409.
    const type = await makeType({ durationMinutes: 30, slotIncrementMinutes: 15 });
    const first = at("2026-11-16T11:00:00.000Z"); // a Monday, 08:00 local
    const second = at("2026-11-16T11:15:00.000Z");

    const settled = await Promise.allSettled([
      bookingsModule.reserveBooking(ctx, { ...reserveInput(first), bookingTypeId: type.id }, NOW),
      bookingsModule.reserveBooking(ctx, { ...reserveInput(second), bookingTypeId: type.id }, NOW),
    ]);

    const won = settled.filter((outcome) => outcome.status === "fulfilled");
    const lost = settled.filter((outcome) => outcome.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    // The loser's failure must be the designed one, not whatever MySQL said.
    const reason = (lost[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(bookingsModule.BookingError);
    expect(reason).toMatchObject({ code: "slotTaken" });

    // And the winner is really the only booking standing on that resource.
    const live = (await bookingsModule.listBookings(ctx, {
      from: at("2026-11-16T00:00:00.000Z"),
      to: at("2026-11-17T00:00:00.000Z"),
      status: "confirmed",
    })).filter((row) => row.resourceId === resourceId);
    expect(live).toHaveLength(1);
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

  it("keeps the original booking when the new slot is not on offer", async () => {
    // The reserve happens first and the cancel only after it commits, so a
    // reschedule that cannot be satisfied leaves the visitor exactly where
    // they were: still booked, at the time they had.
    const type = await makeType();
    const booked = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(at("2026-11-02T11:00:00.000Z")), bookingTypeId: type.id },
      NOW,
    );

    await expect(
      bookingsModule.rescheduleBooking(
        ctx,
        booked.booking.id,
        // A Sunday: outside the resource's Monday-only availability, so no
        // slot was ever offered there.
        at("2026-11-01T14:00:00.000Z"),
        "contact",
        NOW,
      ),
    ).rejects.toMatchObject({ code: "slotUnavailable" });

    const untouched = await bookingsModule.getBooking(ctx, booked.booking.id);
    expect(untouched!.status).toBe("confirmed");
    expect(untouched!.startsAt.toISOString()).toBe("2026-11-02T11:00:00.000Z");
  });

  it("moves a booking from the visitor's own manage link", async () => {
    const type = await makeType();
    const booked = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(at("2026-11-09T11:00:00.000Z")), bookingTypeId: type.id },
      NOW,
    );

    const moved = await publicModule.publicReschedule(
      booked.booking.publicToken,
      "2026-11-09T12:00:00.000Z",
      "203.0.113.9",
      NOW,
    );

    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    // A reschedule is cancel + create, so the visitor lands on a new token —
    // the manage page redirects there rather than showing the cancelled row.
    expect(moved.data.manageToken).not.toBe(booked.booking.publicToken);
    expect(moved.data.startsAt).toBe("2026-11-09T12:00:00.000Z");

    const resolved = await publicModule.getPublicBooking(moved.data.manageToken, NOW);
    expect(resolved!.booking.rescheduledFromId).toBe(booked.booking.id);
  });

  it("treats a reschedule as a move, not a second lead", async () => {
    // Every reserve used to call recordLeadSubmission, so moving an
    // appointment opened a second deal, wrote a second lead_submissions row
    // and re-fired the `lead_received` welcome flow at a customer of a
    // month's standing — while the cancel half fired `booking_cancelled`
    // ("sentimos que cancelaste") for what was only a change of time.
    const { registerAutomationTriggers } = await import("@/modules/automations/triggers");
    registerAutomationTriggers();

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

    const booked = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(at("2026-11-23T11:00:00.000Z")), bookingTypeId: type.id },
      NOW,
    );
    expect(booked.dealId).not.toBeNull();

    const { listDealsForContact } = await import("@/modules/crm/deals");
    expect(await listDealsForContact(ctx, booked.contactId)).toHaveLength(1);
    expect(await submissionCount(booked.contactId)).toBe(1);

    const before = await triggerTypesFired();
    const moved = await bookingsModule.rescheduleBooking(
      ctx,
      booked.booking.id,
      at("2026-11-23T11:30:00.000Z"),
      "contact",
      NOW,
    );

    // The same deal, the same submission, the same contact — carried on.
    expect(moved.dealId).toBe(booked.dealId);
    expect(moved.booking.leadSubmissionId).toBe(booked.booking.leadSubmissionId);
    expect(await listDealsForContact(ctx, booked.contactId)).toHaveLength(1);
    expect(await submissionCount(booked.contactId)).toBe(1);

    const fired = (await triggerTypesFired()).slice(before.length);
    expect(fired).toContain("booking_created");
    expect(fired).not.toContain("lead_received");
    // The cancel half is bookkeeping. `system` + `rescheduled` is the pair
    // the automation layer filters on.
    expect(fired).not.toContain("booking_cancelled");

    const retired = await bookingsModule.getBooking(ctx, booked.booking.id);
    expect(retired!.status).toBe("cancelled");
    expect(retired!.cancelledBy).toBe("system");
    expect(retired!.cancelReason).toBe("rescheduled");
  });

  it("refuses a reschedule to the start the booking already has", async () => {
    const type = await makeType();
    const booked = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(at("2026-11-30T11:00:00.000Z")), bookingTypeId: type.id },
      NOW,
    );

    await expect(
      bookingsModule.rescheduleBooking(
        ctx,
        booked.booking.id,
        at("2026-11-30T11:00:00.000Z"),
        "contact",
        NOW,
      ),
    ).rejects.toMatchObject({ code: "sameSlot" });

    const untouched = await bookingsModule.getBooking(ctx, booked.booking.id);
    expect(untouched!.status).toBe("confirmed");
  });

  it("leaves the original standing when a reschedule loses the race for the new slot", async () => {
    // The failure this inverts: reserve-second meant the residual race
    // cancelled the visitor's appointment and then failed to create its
    // replacement, leaving them with nothing at all.
    const type = await makeType();
    const booked = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(at("2026-12-07T11:00:00.000Z")), bookingTypeId: type.id },
      NOW,
    );
    const target = at("2026-12-07T11:30:00.000Z");

    const [move, rival] = await Promise.allSettled([
      bookingsModule.rescheduleBooking(ctx, booked.booking.id, target, "contact", NOW),
      bookingsModule.reserveBooking(ctx, { ...reserveInput(target), bookingTypeId: type.id }, NOW),
    ]);

    // Whoever won, the visitor who was already booked still has exactly one
    // confirmed appointment. That is the invariant a reschedule may never
    // break, whichever way the race falls.
    const theirs = await bookingsModule.listBookings(ctx, {
      contactId: booked.contactId,
      status: "confirmed",
    });
    expect(theirs).toHaveLength(1);

    if (move.status === "rejected") {
      expect(move.reason).toBeInstanceOf(bookingsModule.BookingError);
      expect(move.reason).toMatchObject({
        code: expect.stringMatching(/slot(Taken|Unavailable)/),
      });
      // Untouched: same row, same time, still confirmed.
      expect(theirs[0].id).toBe(booked.booking.id);
      expect(theirs[0].startsAt.toISOString()).toBe("2026-12-07T11:00:00.000Z");
    } else {
      expect(rival.status).toBe("rejected");
      expect(theirs[0].rescheduledFromId).toBe(booked.booking.id);
    }
  });

  it("leaves no deal behind for a reserve that loses the slot", async () => {
    // The contact stays, deliberately: someone tried to book and the owner
    // wants to know. The deal and the `lead_received` welcome flow do not —
    // both are promises about an appointment that does not exist.
    const { seedDefaultPipeline, listStagesForPipeline } = await import(
      "@/modules/crm/pipelines"
    );
    const pipeline = await seedDefaultPipeline(ctx);
    const [stage] = await listStagesForPipeline(ctx, pipeline!.id);
    const type = await makeType({
      createDeal: true,
      defaultPipelineId: pipeline!.id,
      defaultStageId: stage.id,
      durationMinutes: 30,
      slotIncrementMinutes: 15,
    });

    const inputs = [
      reserveInput(at("2026-12-14T11:00:00.000Z")),
      reserveInput(at("2026-12-14T11:15:00.000Z")),
    ];
    const settled = await Promise.allSettled(
      inputs.map((input) =>
        bookingsModule.reserveBooking(ctx, { ...input, bookingTypeId: type.id }, NOW),
      ),
    );

    const loserIndex = settled.findIndex((outcome) => outcome.status === "rejected");
    expect(loserIndex).toBeGreaterThanOrEqual(0);

    const { getContactByPhone } = await import("@/modules/crm/contacts");
    const loser = await getContactByPhone(ctx, inputs[loserIndex].phone);
    expect(loser).not.toBeNull();

    const { listDealsForContact } = await import("@/modules/crm/deals");
    expect(await listDealsForContact(ctx, loser!.id)).toHaveLength(0);

    // The submission row stays — a record that someone tried — but with no
    // deal hung off it.
    const { db } = await import("@/db/client");
    const { leadSubmissions } = await import("@/db/schema");
    const { eq: equals } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(leadSubmissions)
      .where(equals(leadSubmissions.contactId, loser!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].dealId).toBeNull();
  });

  it("schedules the reminder for the row that will actually happen", async () => {
    const type = await makeType({ settings: { reminderMinutes: 120 } });
    const booked = await bookingsModule.reserveBooking(
      ctx,
      { ...reserveInput(at("2026-12-21T11:00:00.000Z")), bookingTypeId: type.id },
      NOW,
    );
    expect(booked.booking.reminderJobId).toBeTruthy();

    const moved = await bookingsModule.rescheduleBooking(
      ctx,
      booked.booking.id,
      at("2026-12-21T11:30:00.000Z"),
      "contact",
      NOW,
    );
    expect(moved.booking.reminderJobId).toBeTruthy();
    expect(moved.booking.reminderJobId).not.toBe(booked.booking.reminderJobId);

    // The old job survives the move on purpose — "why did they get a
    // reminder for a booking they moved" is answerable — and its handler is
    // what refuses to send.
    const { sendBookingReminder } = await import("./reminders");
    expect(await sendBookingReminder({ tenantId: ctx.tenantId, bookingId: booked.booking.id }))
      .toEqual({ status: "skipped", reason: "not_confirmed" });
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
