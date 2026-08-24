import * as React from "react";

import { cn } from "@/lib/utils";

// A styled native <select>, not a Radix listbox: every picker in this app is
// a short list on a phone, where the OS wheel beats anything we could draw
// (PLAN.md §13 H7's mobile pass is the reason to keep it native).
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "rounded-md border bg-card px-3 py-2 text-sm",
        "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
