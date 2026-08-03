"use client";

import { useState } from "react";

/**
 * Makes the `useActionState` value echo (PLAN.md §10 1R #6) stick on a
 * `<select>`, which it does not do on its own. Returns a number to spread
 * into the select's `key`, so the field remounts once per action result.
 *
 * The reason a plain `defaultValue` is not enough, and neither is making the
 * field controlled:
 *
 *   * `defaultValue` alone — React applies it by marking the matching option
 *     selected at *mount* and never re-applies it, so a rejected submit
 *     hands back a select still showing the old option.
 *   * Controlled alone — React resets the form once the action resolves, and
 *     `form.reset()` restores each option's `selected` *attribute*, which a
 *     controlled select never sets (React only assigns the value property).
 *     The reset therefore lands on option 0 while React still believes its
 *     state is correct, so nothing re-syncs it.
 *
 * Remounting with the echoed value as `defaultValue` works because a fresh
 * mount does set the attribute the reset reads. Between submits the select
 * stays ordinary and uncontrolled, so a poll tick re-rendering the tree
 * (§10 1R #3) leaves a half-made selection alone.
 *
 * Pass the whole action state, not a field: identity is what marks "a new
 * result came back", including two rejected submits carrying the same value.
 */
export function useEchoGeneration<S>(state: S): number {
  const [seenState, setSeenState] = useState(state);
  const [generation, setGeneration] = useState(0);
  // A render-phase adjustment rather than an effect, so the field never
  // paints the wrong option for a frame first.
  if (seenState !== state) {
    setSeenState(state);
    setGeneration((g) => g + 1);
  }
  return generation;
}
