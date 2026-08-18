import { getTranslations } from "next-intl/server";

// Shared `loading.tsx` body for the heavy lists. Deliberately shape-only:
// the point is that a slow query shows the page frame immediately instead of
// a blank viewport, so the bars just stand in for the rows that follow.
export async function ListSkeleton({
  rows = 6,
  variant = "rows",
}: {
  rows?: number;
  variant?: "rows" | "board" | "cards";
}) {
  const t = await getTranslations("errors.loading");

  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("label")}</span>
      <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
      {variant === "board" ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, column) => (
            <div key={column} className="flex w-64 shrink-0 flex-col gap-2 rounded-md border p-2">
              {Array.from({ length: 3 }).map((_, row) => (
                <div key={row} className="h-16 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ))}
        </div>
      ) : variant === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-md border bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}
    </div>
  );
}
