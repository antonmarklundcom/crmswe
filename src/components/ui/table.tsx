import * as React from "react";

import { cn } from "@/lib/utils";

// Tables always scroll inside their own container (PLAN.md §13 H7): the
// wrapper is part of the component so a new table can't forget it and push
// the page sideways on a phone.
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full text-left text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-head" className={className} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("border-b", className)} {...props} />;
}

function TableHeader({ className, ...props }: React.ComponentProps<"th">) {
  return <th data-slot="table-header" className={cn("py-2", className)} {...props} />;
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("py-2", className)} {...props} />;
}

export { Table, TableHead, TableBody, TableRow, TableHeader, TableCell };
