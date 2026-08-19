import * as React from "react";

import { cn } from "@/lib/utils";

// The field styling that was pasted inline in ~120 places (PLAN.md §13 H9
// #3). Same classes it always had, so nothing changes on screen — but a
// focus ring or a disabled state can now be fixed once.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        "placeholder:text-muted-foreground",
        "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
