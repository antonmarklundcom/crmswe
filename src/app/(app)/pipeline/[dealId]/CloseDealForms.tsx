"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { closeDealAction, type CloseDealState } from "./actions";
import { Input } from "@/components/ui/form-fields";

// Declared here, not in actions.ts: a "use server" module may only export
// async functions.
const initialState: CloseDealState = { error: null, closed: false };

export type CloseLabels = {
  won: string;
  lost: string;
  reason: string;
  reasonPlaceholder: string;
  errors: Record<string, string>;
};

/** Won/lost with a reason (PLAN.md §13 H8). The reason is optional for a win
 * and the interesting half of a loss, so both share one form and the copy
 * asks for it either way. */
export function CloseDealForms({ dealId, labels }: { dealId: string; labels: CloseLabels }) {
  const [state, formAction, pending] = useActionState(closeDealAction, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-3">
      <input type="hidden" name="dealId" value={dealId} />

      <label className="flex flex-col gap-1 text-sm">
        {labels.reason}
        <Input
          name="reason"
          maxLength={500}
          placeholder={labels.reasonPlaceholder}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="outcome" value="won" disabled={pending}>
          {labels.won}
        </Button>
        <Button
          type="submit"
          name="outcome"
          value="lost"
          variant="outline"
          disabled={pending}
        >
          {labels.lost}
        </Button>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {labels.errors[state.error] ?? labels.errors.unknown}
        </p>
      )}
    </form>
  );
}
