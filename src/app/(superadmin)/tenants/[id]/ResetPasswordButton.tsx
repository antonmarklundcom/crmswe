"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resetTenantMemberPasswordAction, type ResetPasswordLinkState } from "./actions";

// Superadmin password reset for a tenant member. Reuses the exact mechanism
// the tenant admin's own "enviar restablecimiento" action already uses
// (Better Auth's request-password-reset flow), plus the same on-screen-link
// fallback the invite flow shows when Resend isn't configured (DEPLOY.md §4)
// — safe here specifically because the superadmin already knows the account
// exists (it's in the tenant's own member list), unlike the public
// /forgot-password flow's timing-safe "check your email" response.

export type ResetPasswordLabels = {
  trigger: string;
  linkTitle: string;
  linkHelp: string;
  copy: string;
  copied: string;
  error: string;
};

const initialState: ResetPasswordLinkState = { error: null, resetUrl: null };

export function ResetPasswordButton({
  tenantId,
  userId,
  labels,
}: {
  tenantId: string;
  userId: string;
  labels: ResetPasswordLabels;
}) {
  const [state, formAction, pending] = useActionState(
    resetTenantMemberPasswordAction,
    initialState,
  );
  const [copied, setCopied] = useState(false);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the URL is still selectable on screen.
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {labels.trigger}
        </Button>
      </form>

      {state.error && <p className="text-sm text-destructive">{labels.error}</p>}

      {state.resetUrl && (
        <div className="flex w-full max-w-sm flex-col gap-2 rounded-md border bg-muted/40 px-3 py-3 text-left">
          <span className="text-sm font-medium">{labels.linkTitle}</span>
          <span className="text-xs text-muted-foreground">{labels.linkHelp}</span>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded border bg-background px-2 py-1 font-mono text-xs">
              {state.resetUrl}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copyLink(state.resetUrl!)}
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
