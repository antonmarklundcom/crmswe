"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Connection guide for the webhook lane (PLAN.md §5.2.5). The existing
// SiteGuide documents lane 1 only — a server-side handler with the key in
// env, which is exactly what a client on Elementor or Wix cannot do.
//
// The audience here is not a developer. It is the owner sitting with a
// client's site open, or the client themselves following instructions over
// WhatsApp. So this is click-by-click, not a code sample: the only technical
// step is pasting a URL the CRM generated.

export type HookGuidePlatform = {
  id: string;
  label: string;
  steps: string[];
};

export type HookGuideLabels = {
  title: string;
  intro: string;
  captureTitle: string;
  captureBody: string;
  platforms: HookGuidePlatform[];
  urlNote: string;
};

export function SiteHookGuide({ labels }: { labels: HookGuideLabels }) {
  const [active, setActive] = useState(labels.platforms[0]?.id);
  const current = labels.platforms.find((p) => p.id === active) ?? labels.platforms[0];

  if (!current) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{labels.title}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{labels.intro}</p>
      </div>

      <div className="flex flex-wrap gap-1">
        {labels.platforms.map((platform) => (
          <button
            key={platform.id}
            type="button"
            onClick={() => setActive(platform.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              platform.id === current.id
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {platform.label}
          </button>
        ))}
      </div>

      <ol className="flex flex-col gap-3">
        {current.steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
              {index + 1}
            </span>
            <span className="min-w-0 text-sm text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2 rounded-md border border-dashed px-4 py-3">
        <span className="text-sm font-medium">{labels.captureTitle}</span>
        <p className="text-sm text-muted-foreground">{labels.captureBody}</p>
        <p className="text-sm text-muted-foreground">{labels.urlNote}</p>
      </div>
    </section>
  );
}
