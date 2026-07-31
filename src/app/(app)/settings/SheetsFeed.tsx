"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { regenerateFeedTokenAction } from "./actions";

// Google Sheets connection. Deliberately pull-based: the sheet fetches a
// tokened CSV URL with IMPORTDATA, refreshing itself roughly hourly. No
// Google OAuth, no Cloud project, no consent-screen verification, nothing to
// renew — and no monthly cost.

export type SheetsLabels = {
  formulaLabel: string;
  copy: string;
  copied: string;
  generate: string;
  regenerate: string;
  regenerateWarning: string;
  steps: string[];
};

export function SheetsFeed({
  currentUrl,
  labels,
}: {
  currentUrl: string | null;
  labels: SheetsLabels;
}) {
  const [copied, setCopied] = useState(false);

  const formula = currentUrl ? `=IMPORTDATA("${currentUrl}")` : null;

  async function copyFormula(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the formula is selectable on screen.
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {labels.steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
              {index + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>

      {formula && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{labels.formulaLabel}</span>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted px-2 py-2 font-mono text-xs">
              {formula}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copyFormula(formula)}
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

      <form action={regenerateFeedTokenAction} className="flex flex-col gap-2">
        <Button type="submit" variant={currentUrl ? "outline" : "default"} className="w-fit">
          {currentUrl ? labels.regenerate : labels.generate}
        </Button>
        {currentUrl && (
          <span className="text-xs text-muted-foreground">{labels.regenerateWarning}</span>
        )}
      </form>
    </div>
  );
}
