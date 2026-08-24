import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "rounded-md border bg-card px-3 py-2 text-sm",
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

export { Textarea };
