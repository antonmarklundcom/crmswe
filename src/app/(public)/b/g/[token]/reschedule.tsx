"use client";

import { useActionState, useState } from "react";
import { SlotPicker, type SlotPickerLabels } from "../../slot-picker";
import { rescheduleBookingAction, type RescheduleState } from "./actions";

// Moving a booking from the visitor's own manage link. It asks the same
// question of the same endpoint the booking page does — the picker is shared
// (../../slot-picker), so "what is free" has one implementation.
//
// A reschedule is cancel + create, so it lands on a *new* token: the action
// redirects there on success, which is why nothing here has to reconcile the
// old booking's state.

const initialState: RescheduleState = { error: null };

export function RescheduleSection({
  token,
  tenantSlug,
  typeSlug,
  timeZone,
  locale,
  accent,
  labels,
}: {
  token: string;
  tenantSlug: string;
  typeSlug: string;
  timeZone: string;
  locale: string;
  accent?: string;
  labels: SlotPickerLabels & {
    rescheduleAction: string;
    rescheduleTitle: string;
    rescheduleConfirm: string;
    rescheduleClose: string;
    errors: Record<string, string>;
  };
}) {
  const bound = rescheduleBookingAction.bind(null, token);
  const [state, action, pending] = useActionState<RescheduleState, FormData>(bound, initialState);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border px-4 py-2 text-sm"
      >
        {labels.rescheduleAction}
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{labels.rescheduleTitle}</h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setChosen(null);
          }}
          className="text-xs underline"
        >
          {labels.rescheduleClose}
        </button>
      </div>

      <SlotPicker
        tenantSlug={tenantSlug}
        typeSlug={typeSlug}
        timeZone={timeZone}
        locale={locale}
        labels={labels}
        selected={chosen}
        onSelect={setChosen}
      />

      {chosen ? (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="startsAt" value={chosen} />
          <p className="text-sm">
            {new Intl.DateTimeFormat(locale, {
              timeZone,
              dateStyle: "full",
              timeStyle: "short",
            }).format(new Date(chosen))}
          </p>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            style={accent ? { backgroundColor: accent } : undefined}
          >
            {labels.rescheduleConfirm}
          </button>
        </form>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {labels.errors[state.error] ?? labels.errors.generic}
        </p>
      ) : null}
    </section>
  );
}
