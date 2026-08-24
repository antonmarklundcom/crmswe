"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-fields";
import { runProductImportAction, type ProductImportState } from "./actions";

const emptyState: ProductImportState = { error: null, report: null };

export function ImportProductsForm() {
  const t = useTranslations("app.products.import");
  const [state, formAction, pending] = useActionState(runProductImportAction, emptyState);

  if (state.report) {
    const report = state.report;
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("reportTitle")}</h2>
        <p className="text-sm">
          {t("reportSummary", {
            total: report.total,
            created: report.created,
            updated: report.updated,
            errors: report.errors.length,
          })}
        </p>

        {report.errors.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">{t("errorRow")}</th>
                  <th className="py-2">{t("errorReason")}</th>
                </tr>
              </thead>
              <tbody>
                {report.errors.slice(0, 200).map((error) => (
                  <tr key={`${error.row}-${error.reason}`} className="border-b">
                    <td className="py-2">{error.row}</td>
                    <td className="py-2">
                      {t(`errorReasons.${error.reason}` as "errorReasons.failed")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.errors.length > 200 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("errorsTruncated", { count: report.errors.length - 200 })}
              </p>
            )}
          </div>
        )}

        <Link href="/products" className="text-sm underline underline-offset-4">
          {t("backToProducts")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("matchNote")}</p>

      <label className="flex flex-col gap-1 text-sm">
        {t("file")}
        <Input type="file" name="file" accept=".csv,text/csv" />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("paste")}
        <Textarea
          name="pasted"
          rows={6}
          placeholder={t("pastePlaceholder")}
          className="font-mono text-xs"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.empty")}
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("importing") : t("import")}
        </Button>
      </div>
    </form>
  );
}
