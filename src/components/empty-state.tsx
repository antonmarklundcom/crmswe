import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// Shared "there's nothing here yet" panel. A blank table tells a new tenant
// admin nothing, so every list view explains what the feature is for and
// points at the one action that fills it (PLAN.md §10 1H: the product has to
// be usable by someone who just got their login, not just by us).
//
// Copy always arrives already translated from the calling server component —
// this component holds no strings of its own.

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional CTA. Both props together or neither. */
  actionLabel?: string;
  actionHref?: string;
  className?: string;
  /** Extra hints rendered under the CTA (e.g. a second, secondary link). */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="text-base font-medium">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className={cn(buttonVariants({ size: "sm" }), "mt-1")}>
          {actionLabel}
        </Link>
      )}
      {children}
    </div>
  );
}
