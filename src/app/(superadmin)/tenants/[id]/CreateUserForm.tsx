"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { createTenantUserAction, type CreateTenantUserState } from "./actions";

export type CreateUserLabels = {
  name: string;
  email: string;
  password: string;
  role: string;
  roleAdmin: string;
  roleAgent: string;
  submit: string;
  created: string;
  errors: Record<string, string>;
};

const initialState: CreateTenantUserState = { error: null, createdEmail: null };

export function CreateUserForm({
  tenantId,
  labels,
}: {
  tenantId: string;
  labels: CreateUserLabels;
}) {
  const [state, formAction, pending] = useActionState(createTenantUserAction, initialState);

  return (
    <div className="flex max-w-sm flex-col gap-3">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="tenantId" value={tenantId} />
        <label className="flex flex-col gap-1 text-sm">
          {labels.name}
          <input name="name" required className="rounded-md border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.email}
          <input name="email" type="email" required className="rounded-md border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.password}
          <input
            name="password"
            type="text"
            minLength={8}
            required
            className="rounded-md border px-3 py-2 font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.role}
          <select name="role" defaultValue="admin" className="rounded-md border px-3 py-2">
            <option value="admin">{labels.roleAdmin}</option>
            <option value="agent">{labels.roleAgent}</option>
          </select>
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
      {state.createdEmail && (
        <p className="text-sm text-muted-foreground">
          {labels.created} <strong>{state.createdEmail}</strong>
        </p>
      )}
    </div>
  );
}
