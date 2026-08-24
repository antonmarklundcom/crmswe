"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { TURNSTILE_RESPONSE_FIELD } from "@/lib/turnstile";
import type { BookingQuestion } from "@/modules/booking/types";

// The visitor's half of the booking page (docs/SPEC-BOOKING.md §5).
//
// Client-side only because picking a day should not reload the page — every
// fetch below is **same-origin**, to our own /api/v1/booking routes, which is
// what lets this exist without adding a CORS surface (§5.1's lock).

type Labels = {
  chooseDay: string;
  chooseTime: string;
  noSlots: string;
  previousMonth: string;
  nextMonth: string;
  yourData: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  submit: string;
  confirmedTitle: string;
  manageHint: string;
  errorSlotTaken: string;
  errorGeneric: string;
  rateLimited: string;
};

type Props = {
  tenantSlug: string;
  typeSlug: string;
  timeZone: string;
  locale: string;
  questions: BookingQuestion[];
  turnstileSiteKey: string | null;
  accent?: string;
  labels: Labels;
};

function dayKeyOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function BookingPicker({
  tenantSlug,
  typeSlug,
  timeZone,
  locale,
  questions,
  turnstileSiteKey,
  accent,
  labels,
}: Props) {
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<{ startsAt: string; manageUrl: string } | null>(null);

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
      const key = dayKeyOf(slot, timeZone);
      grouped.set(key, [...(grouped.get(key) ?? []), slot]);
    }
    return grouped;
  }, [slots, timeZone]);

  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);

  useEffect(() => {
    // Keep a chosen day only while it still has slots — a month change or a
    // slot taken elsewhere must not leave a stale selection armed.
    if (day && !byDay.has(day)) {
      setDay(null);
      setChosen(null);
    }
  }, [day, byDay]);

  if (confirmed) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold" style={{ color: accent }}>
          {labels.confirmedTitle}
        </h2>
        <p className="text-sm">
          {new Intl.DateTimeFormat(locale, {
            timeZone,
            dateStyle: "full",
            timeStyle: "short",
          }).format(new Date(confirmed.startsAt))}
        </p>
        <p className="text-sm text-muted-foreground">{labels.manageHint}</p>
        <a className="text-sm underline" href={confirmed.manageUrl}>
          {confirmed.manageUrl}
        </a>
      </section>
    );
  }

  async function submit(formData: FormData) {
    if (!chosen) return;
    setSubmitting(true);
    setError(null);

    const answers: Record<string, string> = {};
    for (const question of questions) {
      const value = formData.get(`q_${question.key}`);
      if (value) answers[question.key] = String(value);
    }

    try {
      const response = await fetch(
        `/api/v1/booking/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(typeSlug)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            startsAt: chosen,
            name: formData.get("name"),
            phone: formData.get("phone"),
            email: formData.get("email") || undefined,
            message: formData.get("message") || undefined,
            answers,
            _hp: formData.get("_hp") || undefined,
            turnstile_token: formData.get(TURNSTILE_RESPONSE_FIELD) || undefined,
            page_url: globalThis.location?.href,
            referrer: document.referrer || undefined,
          }),
        },
      );

      if (response.status === 409) {
        // Someone took it while the form was open. Re-fetch so the visitor
        // picks from what is actually free rather than retrying a dead slot.
        setError(labels.errorSlotTaken);
        setChosen(null);
        setMonthOffset((current) => current);
        setSlots((current) => current.filter((slot) => slot !== chosen));
        return;
      }
      if (!response.ok) {
        setError(response.status === 429 ? labels.rateLimited : labels.errorGeneric);
        return;
      }

      const body = (await response.json()) as { startsAt: string; manageToken: string };
      setConfirmed({
        startsAt: body.startsAt,
        manageUrl: `${globalThis.location.origin}/b/g/${body.manageToken}`,
      });
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

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
                  setChosen(null);
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
                onClick={() => setChosen(slot)}
                className={`rounded-md border px-3 py-2 text-sm ${chosen === slot ? "border-primary bg-accent" : ""}`}
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

      {chosen ? (
        <form action={submit} className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">{labels.yourData}</h2>
          {/* Honeypot: real visitors never see or fill this field. */}
          <input
            type="text"
            name="_hp"
            tabIndex={-1}
            autoComplete="off"
            className="absolute -left-[9999px]"
            aria-hidden="true"
          />
          <label className="flex flex-col gap-1 text-sm">
            {labels.name}
            <input name="name" className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {labels.phone}
            <input name="phone" type="tel" className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {labels.email}
            <input name="email" type="email" className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {labels.message}
            <textarea name="message" rows={3} className="rounded-md border px-3 py-2" />
          </label>

          {questions.map((question) => (
            <label key={question.key} className="flex flex-col gap-1 text-sm">
              {question.label}
              {question.type === "textarea" ? (
                <textarea name={`q_${question.key}`} rows={3} className="rounded-md border px-3 py-2" />
              ) : question.type === "select" ? (
                <select name={`q_${question.key}`} className="rounded-md border px-3 py-2">
                  {(question.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name={`q_${question.key}`}
                  type={question.type === "email" ? "email" : "text"}
                  className="rounded-md border px-3 py-2"
                />
              )}
            </label>
          ))}

          {turnstileSiteKey ? (
            <>
              <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
              <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                async
                defer
                strategy="afterInteractive"
              />
            </>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            style={accent ? { backgroundColor: accent } : undefined}
          >
            {labels.submit}
          </button>
        </form>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
