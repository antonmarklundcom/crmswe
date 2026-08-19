"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

// The modal shape the command palette introduced (§13 H8), lifted into a
// primitive so the next one — a confirm, a drawer — doesn't reinvent the
// overlay, the click-outside, or the Escape handling.
function Dialog({
  open,
  onClose,
  label,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name; the dialog has no visible title of its own. */
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <div
        className={cn(
          "flex w-full max-w-lg flex-col overflow-hidden rounded-md border bg-background shadow-lg",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export { Dialog };
