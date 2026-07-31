"use client";

import { useActionState } from "react";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { inviteUserAction, type InviteState } from "./actions";

// Invite form + the resulting link. Uses useActionState (the shape
// acceptInviteAction already established) so validation failures land inline
// instead of on Next's error page.

export type InviteLabels = {
  email: string;
  role: string;
  roleAdmin: string;
  roleAgent: string;
  submit: string;
  linkTitle: string;
  linkHelp: string;
  copy: string;
  copied: string;
  errors: Record<string, string>;
};

const initialState: InviteState = { error: null, inviteUrl: null };

export function InviteForm({ labels }: { labels: InviteLabels }) {
  const [state, formAction, pending] = useActionState(inviteUserAction, initialState);
  const [copied, setCopied] = useState(false);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin, permissions) — the URL is
      // selectable on screen, so this is a convenience, not the only path.
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {labels.email}
          <input
            name="email"
            type="email"
            required
            className="rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.role}
          <select name="role" defaultValue="agent" className="rounded-md border px-3 py-2">
            <option value="agent">{labels.roleAgent}</option>
            <option value="admin">{labels.roleAdmin}</option>
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

      {state.inviteUrl && (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/40 px-3 py-3">
          <span className="text-sm font-medium">{labels.linkTitle}</span>
          <span className="text-xs text-muted-foreground">{labels.linkHelp}</span>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded border bg-background px-2 py-1 font-mono text-xs">
              {state.inviteUrl}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copyLink(state.inviteUrl!)}
            >
              {copied ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
              {copied ? labels.copied : labels.copy}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
