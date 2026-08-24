"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form-fields";
import { updateTenantMemberProfileAction, type UpdateMemberProfileState } from "./actions";

// Superadmin edit of a member's name/email (PLAN.md §3.1: `users` is a
// platform table, so this is a cross-tenant write gated on is_superadmin,
// the same as adding/removing a membership). A dialog rather than an inline
// row edit — unlike role/estado, which are one click each, this has two
// fields and a real failure mode (email taken) worth a moment's focus.

export type MemberEditLabels = {
  trigger: string;
  title: string;
  name: string;
  email: string;
  save: string;
  cancel: string;
  errors: Record<string, string>;
};

const initialState: UpdateMemberProfileState = { error: null, field: null, success: false };

export function MemberEditDialog({
  tenantId,
  userId,
  name,
  email,
  labels,
}: {
  tenantId: string;
  userId: string;
  name: string;
  email: string;
  labels: MemberEditLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateTenantMemberProfileAction,
    initialState,
  );

  // Close on a successful save — the revalidated row shows the new values.
  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        {labels.trigger}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={labels.title}>
        <form action={formAction} className="flex flex-col gap-4 p-4">
          <h2 className="text-base font-semibold">{labels.title}</h2>
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="userId" value={userId} />
          <label className="flex flex-col gap-1 text-sm">
            {labels.name}
            <Input name="name" defaultValue={name} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {labels.email}
            <Input name="email" type="email" defaultValue={email} required />
          </label>
          {state.error && (
            <p className="text-sm text-destructive">
              {labels.errors[state.error] ?? labels.errors.unknown}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
              {labels.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {labels.save}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
