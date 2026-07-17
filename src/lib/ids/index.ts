import { ulid } from "ulid";

// Application-generated 26-char sortable IDs for every table PK (PLAN.md §2.3).
// Never expose auto-increment IDs.
export function newId(): string {
  return ulid();
}
