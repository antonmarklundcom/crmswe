"use client";

import { useEffect, useMemo, useState } from "react";

// The day-and-time half of the public booking surface, shared by the booking
// page (/b/[tenantSlug]/[typeSlug]) and the manage page's reschedule
// (/b/g/[token]) — moving a booking offers exactly the same free slots as
// making one, so it asks the same question of the same endpoint rather than
// growing a second, subtly different picker.
//
// Every fetch here is **same-origin**, to our own /api/v1/booking routes,
// which is what lets this exist without adding a CORS surface.

export type SlotPickerLabels = {
  chooseDay: string;
  chooseTime: string;
  noSlots: string;
  previousMonth: string;
  nextMonth: string;
  errorGeneric: string;
  rateLimited: string;
};

function dayKeyOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function SlotPicker({
  tenantSlug,
  typeSlug,
  timeZone,
  locale,
  labels,
  selected,
  onSelect,
  excluded = [],
}: {
  tenantSlug: string;
  typeSlug: string;
  timeZone: string;
  locale: string;
  labels: SlotPickerLabels;
  selected: string | null;
  onSelect: (startsAt: string | null) => void;
  /** Slots the caller has learned are gone — a 409 on submit, typically. */
  excluded?: string[];
}) {
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const window = useMemo(() => {
    const base = new Date();
    base.setUTCDate(1);
    base.setUTCMonth(base.getUTCMonth() + monthOffset);
    const from = base.toISOString().slice(0, 10);
    const end = new Date(base);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { from, to: end.toISOString().slice(0, 10) };
  }, [monthOffset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(
      `/api/v1/booking/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(typeSlug)}/slots?from=${window.from}&to=${window.to}`,
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.status === 429 ? labels.rateLimited : labels.errorGeneric);
        }
        return response.json() as Promise<{ slots: Array<{ startsAt: string }> }>;
      })
      .then((body) => {
        if (cancelled) return;
        setSlots(body.slots.map((slot) => slot.startsAt));
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantSlug, typeSlug, window, labels.errorGeneric, labels.rateLimited]);

  const byDay = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const slot of slots) {
      if (excluded.includes(slot)) continue;
      const key = dayKeyOf(slot, timeZone);
      grouped.set(key, [...(grouped.get(key) ?? []), slot]);
    }
    return grouped;
  }, [slots, timeZone, excluded]);

  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);

  useEffect(() => {
    // Keep a chosen day only while it still has slots — a month change or a
    // slot taken elsewhere must not leave a stale selection armed.
    if (day && !byDay.has(day)) {
      setDay(null);
      onSelect(null);
    }
    // `onSelect` is the caller's setter and is deliberately not a dependency:
    // an inline arrow would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, byDay]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{labels.chooseDay}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border px-2 py-1 text-xs"
              onClick={() => setMonthOffset((current) => Math.max(0, current - 1))}
              disabled={monthOffset === 0}
            >
              {labels.previousMonth}
            </button>
            <button
              type="button"
              className="rounded-md border px-2 py-1 text-xs"
              onClick={() => setMonthOffset((current) => current + 1)}
            >
              {labels.nextMonth}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : days.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.noSlots}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {days.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setDay(key);
                  onSelect(null);
                }}
                className={`rounded-md border px-3 py-2 text-sm ${day === key ? "border-primary bg-accent" : ""}`}
              >
                {new Intl.DateTimeFormat(locale, {
                  timeZone,
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                }).format(new Date(`${key}T12:00:00Z`))}
              </button>
            ))}
          </div>
        )}
      </section>

      {day ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">{labels.chooseTime}</h2>
          <div className="flex flex-wrap gap-2">
            {(byDay.get(day) ?? []).map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => onSelect(slot)}
                className={`rounded-md border px-3 py-2 text-sm ${selected === slot ? "border-primary bg-accent" : ""}`}
              >
                {new Intl.DateTimeFormat(locale, {
                  timeZone,
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(new Date(slot))}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
