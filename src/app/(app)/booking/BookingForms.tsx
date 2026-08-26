"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import {
  createBlackoutAction,
  createBookingTypeAction,
  createResourceAction,
  saveAvailabilityAction,
  setTypeResourcesAction,
  type FormState,
} from "./actions";

// Lives here, not in actions.ts: a "use server" module may only export
// async functions.
const emptyFormState: FormState = { error: null, values: {} };

// The interactive half of /booking. Every string arrives pre-translated from
// the server page — this file holds no copy of its own (§1.2).

export type TypeLabels = {
  name: string;
  slug: string;
  duration: string;
  create: string;
  errors: Record<string, string>;
};

export function NewBookingTypeForm({ labels }: { labels: TypeLabels }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createBookingTypeAction,
    emptyFormState,
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {labels.name}
        <Input name="name" defaultValue={state.values.name} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.slug}
        <Input name="slug" defaultValue={state.values.slug} placeholder="consulta" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.duration}
        <Input name="durationMinutes" type="number" defaultValue={state.values.durationMinutes ?? "30"} />
      </label>
      <Button type="submit" disabled={pending}>
        {labels.create}
      </Button>
      {state.error ? (
        <p className="w-full text-sm text-destructive">{labels.errors[state.error]}</p>
      ) : null}
    </form>
  );
}

export type ResourceLabels = {
  name: string;
  kindUser: string;
  kindResource: string;
  user: string;
  none: string;
  create: string;
  errors: Record<string, string>;
};

export function NewResourceForm({
  labels,
  users,
}: {
  labels: ResourceLabels;
  users: Array<{ id: string; label: string }>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createResourceAction,
    emptyFormState,
  );
  const [kind, setKind] = useState("user");

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {labels.name}
        <Input name="name" defaultValue={state.values.name} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.kindUser}
        <Select name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="user">{labels.kindUser}</option>
          <option value="resource">{labels.kindResource}</option>
        </Select>
      </label>
      {/* A room has no login, so the user picker only exists for a person. */}
      {kind === "user" ? (
        <label className="flex flex-col gap-1 text-sm">
          {labels.user}
          <Select name="userId" defaultValue="">
            <option value="">{labels.none}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      <Button type="submit" disabled={pending}>
        {labels.create}
      </Button>
      {state.error ? (
        <p className="w-full text-sm text-destructive">{labels.errors[state.error]}</p>
      ) : null}
    </form>
  );
}

export type AvailabilityLabels = {
  from: string;
  to: string;
  addRange: string;
  save: string;
  weekdays: string[];
  errors: Record<string, string>;
};

type Range = { start: string; end: string };

export function AvailabilityForm({
  resourceId,
  initial,
  labels,
}: {
  resourceId: string;
  initial: Record<number, Range[]>;
  labels: AvailabilityLabels;
}) {
  const bound = saveAvailabilityAction.bind(null, resourceId);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, emptyFormState);
  const [week, setWeek] = useState<Record<number, Range[]>>(() => {
    const start: Record<number, Range[]> = {};
    for (let day = 0; day <= 6; day += 1) {
      start[day] = initial[day]?.length ? initial[day] : [{ start: "", end: "" }];
    }
    return start;
  });

  function update(day: number, index: number, key: keyof Range, value: string) {
    setWeek((current) => ({
      ...current,
      [day]: current[day].map((range, position) =>
        position === index ? { ...range, [key]: value } : range,
      ),
    }));
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
        <div key={day} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-24 shrink-0 text-muted-foreground">{labels.weekdays[day]}</span>
          {week[day].map((range, index) => (
            <span key={index} className="flex items-center gap-1">
              <Input
                type="time"
                name={`start_${day}`}
                value={range.start}
                aria-label={labels.from}
                onChange={(event) => update(day, index, "start", event.target.value)}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                name={`end_${day}`}
                value={range.end}
                aria-label={labels.to}
                onChange={(event) => update(day, index, "end", event.target.value)}
              />
            </span>
          ))}
          {/* A second range on one day is how a midday close is expressed —
              the schema allows several rows per weekday for exactly this. */}
          <button
            type="button"
            className="text-xs underline"
            onClick={() =>
              setWeek((current) => ({
                ...current,
                [day]: [...current[day], { start: "", end: "" }],
              }))
            }
          >
            {labels.addRange}
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {labels.save}
        </Button>
        {state.error ? (
          <p className="text-sm text-destructive">{labels.errors[state.error]}</p>
        ) : null}
      </div>
    </form>
  );
}

export function TypeResourcesPicker({
  bookingTypeId,
  resources,
  selected,
  label,
}: {
  bookingTypeId: string;
  resources: Array<{ id: string; name: string }>;
  selected: string[];
  label: string;
}) {
  const [chosen, setChosen] = useState<string[]>(selected);
  const [saving, setSaving] = useState(false);

  async function toggle(id: string) {
    const next = chosen.includes(id) ? chosen.filter((value) => value !== id) : [...chosen, id];
    setChosen(next);
    setSaving(true);
    await setTypeResourcesAction(bookingTypeId, next);
    setSaving(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {resources.map((resource) => (
        <button
          key={resource.id}
          type="button"
          disabled={saving}
          onClick={() => toggle(resource.id)}
          className={`rounded-md border px-2 py-1 text-xs ${chosen.includes(resource.id) ? "border-primary bg-accent" : ""}`}
        >
          {resource.name}
        </button>
      ))}
    </div>
  );
}

export type BlackoutLabels = {
  resource: string;
  wholeTenant: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timeHelp: string;
  reason: string;
  create: string;
  errors: Record<string, string>;
};

/**
 * Closing for a holiday, a vacation or an afternoon. The slot generator has
 * dropped slots inside a blackout since it shipped; this is what creates one.
 *
 * Dates and times, not a `datetime-local`: the closure is in the tenant's
 * timezone and the action resolves it there, so an admin travelling does not
 * close a different day than the one they picked.
 */
export function NewBlackoutForm({
  labels,
  resources,
}: {
  labels: BlackoutLabels;
  resources: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createBlackoutAction,
    emptyFormState,
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {labels.resource}
        <Select name="resourceId" defaultValue={state.values.resourceId ?? ""}>
          {/* Empty is the whole tenant — the column is nullable for exactly
              this, and a holiday closes everyone. */}
          <option value="">{labels.wholeTenant}</option>
          {resources.map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.startDate}
        <Input type="date" name="startDate" defaultValue={state.values.startDate} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.endDate}
        <Input type="date" name="endDate" defaultValue={state.values.endDate} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.startTime}
        <Input type="time" name="startTime" defaultValue={state.values.startTime} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.endTime}
        <Input type="time" name="endTime" defaultValue={state.values.endTime} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.reason}
        <Input name="reason" defaultValue={state.values.reason} />
      </label>
      <Button type="submit" disabled={pending}>
        {labels.create}
      </Button>
      <p className="w-full text-xs text-muted-foreground">{labels.timeHelp}</p>
      {state.error ? (
        <p className="w-full text-sm text-destructive">{labels.errors[state.error]}</p>
      ) : null}
    </form>
  );
}
