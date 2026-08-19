// The field list and mapping shape, split out from import.ts so the client
// wizard can name its columns without pulling the importer — and through it
// the database client — into the browser bundle. (A `use client` component
// importing anything that reaches @/db/client fails the build on `net`.)

export const IMPORTABLE_FIELDS = ["name", "phone", "email", "notes", "source"] as const;

export type ImportableField = (typeof IMPORTABLE_FIELDS)[number];

/** Column header → contact field. A header mapped to nothing is ignored. */
export type ImportMapping = Partial<Record<ImportableField, string>>;
