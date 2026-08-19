import * as React from "react";

import { cn } from "@/lib/utils";

// The label shape this app uses everywhere: the text, then the control it
// wraps. Wrapping (rather than htmlFor) is why none of the inputs needed an
// id — keeping that, because adding ~120 ids would be a bigger change than
// the one this batch is making.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  );
}

export { Label };
