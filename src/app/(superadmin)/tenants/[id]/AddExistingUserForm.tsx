"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { addExistingUserToTenantAction, type AddExistingUserState } from "./actions";
import { Input, Select } from "@/components/ui/form-fields";

// Granting someone who already has an account access to this business too
// (PLAN.md §3.1, reopened). Deliberately email-only: the superadmin types the
// address they already know, rather than picking from a platform-wide list of
// every person on every tenant.

export type AddExistingUserLabels = {
  email: string;
  role: string;
  roleAdmin: string;
  roleAgent: string;
  submit: string;
  added: string;
  errors: Record<string, string>;
};

const initialState: AddExistingUserState = { error: null, addedEmail: null };

export function AddExistingUserForm({
  tenantId,
  labels,
}: {
  tenantId: string;
  labels: AddExistingUserLabels;
}) {
  const [state, formAction, pending] = useActionState(
    addExistingUserToTenantAction,
    initialState,
  );

  return (
    <div className="flex max-w-sm flex-col gap-3">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="tenantId" value={tenantId} />
        <label className="flex flex-col gap-1 text-sm">
          {labels.email}
          <Input name="email" type="email" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.role}
          <Select name="role" defaultValue="agent">
            <option value="admin">{labels.roleAdmin}</option>
            <option value="agent">{labels.roleAgent}</option>
          </Select>
        </label>
        <Button type="submit" disabled={pending}>
          {labels.submit}
        </Button>
      </form>

      {state.error && (
        <p className="text-sm text-destructive">
          {labels.errors[state.error] ?? labels.errors.unknown}
        </p>
      )}
      {state.addedEmail && (
        <p className="text-sm text-muted-foreground">
          {labels.added} <strong>{state.addedEmail}</strong>
        </p>
      )}
    </div>
  );
}
