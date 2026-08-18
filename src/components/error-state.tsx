"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One presentation for every route-group `error.tsx`: the groups differ only
// in their copy namespace and where "back" goes, so the boundary itself is
// shared rather than pasted four times.
export function ErrorState({
  namespace,
  digest,
  reset,
  backHref,
}: {
  namespace: string;
  digest?: string;
  reset: () => void;
  backHref?: string;
}) {
  const t = useTranslations(namespace);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("body")}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={reset}>
          {t("retry")}
        </Button>
        {backHref && (
          <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
            {t("back")}
          </Link>
        )}
      </div>
      {digest && <p className="text-xs text-muted-foreground">{digest}</p>}
    </main>
  );
}
