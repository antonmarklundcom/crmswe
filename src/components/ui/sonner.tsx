"use client";

import { Toaster as Sonner } from "sonner";

// App-wide toast host. Actions that fail in the background — a drag that the
// server rejected, a send that never left — have no form to render an error
// into, so they surface here instead of failing silently.
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "rounded-md border bg-background text-foreground text-sm shadow-md",
        },
      }}
    />
  );
}
