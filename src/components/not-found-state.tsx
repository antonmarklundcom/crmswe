import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Same reasoning as ErrorState: one 404 presentation, per-group copy.
export async function NotFoundState({
  namespace,
  backHref,
}: {
  namespace: string;
  backHref?: string;
}) {
  const t = await getTranslations(namespace);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("body")}</p>
      {backHref && (
        <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
          {t("back")}
        </Link>
      )}
    </main>
  );
}
