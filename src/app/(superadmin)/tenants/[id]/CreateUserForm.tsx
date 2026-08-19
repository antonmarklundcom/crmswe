"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { createTenantUserAction, type CreateTenantUserState } from "./actions";
import { Input, Select } from "@/components/ui/form-fields";

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
          <Input name="name" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.email}
          <Input name="email" type="email" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.password}
          <Input
            name="password"
            type="text"
            minLength={8}
            required
            className="font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.role}
          <Select name="role" defaultValue="admin">
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
      {state.createdEmail && (
        <p className="text-sm text-muted-foreground">
          {labels.created} <strong>{state.createdEmail}</strong>
        </p>
      )}
    </div>
  );
}
