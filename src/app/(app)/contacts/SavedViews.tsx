"use client";

import { useActionState, useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { cn } from "@/lib/utils";
import {
  deleteContactViewAction,
  saveContactViewAction,
  type SaveViewState,
} from "./view-actions";

// Saved views (PLAN.md §10 1J #1): the filter set a rep rebuilds every
// morning — "leads de esta semana sin responsable" — kept as a named link.
// The chips are plain <Link>s to the same list, which is the point: a view
// is the URL, so it sorts, pages and exports exactly like the filters the
// rep set by hand.

const initialState: SaveViewState = { error: null, saved: false };

export type SavedView = {
  id: string;
  name: string;
  query: string;
  canDelete: boolean;
};

export function SavedViews({
  views,
  activeQuery,
}: {
  views: SavedView[];
  /** The current list's canonical querystring — what "guardar vista" stores,
   * and what decides which chip reads as active. */
  activeQuery: string;
}) {
  const t = useTranslations("app.contacts.views");
  const [state, formAction, saving] = useActionState(saveContactViewAction, initialState);
  const [removing, startRemoving] = useTransition();

  if (views.length === 0 && !activeQuery) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {views.length > 0 && <span className="text-xs text-muted-foreground">{t("label")}</span>}

      {views.map((view) => {
        const isActive = view.query === activeQuery;
        return (
          <span
            key={view.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1",
              isActive && "border-foreground/30 bg-muted",
            )}
          >
            <Link
              href={view.query ? `/contacts?${view.query}` : "/contacts"}
              className="hover:underline"
            >
              {view.name}
            </Link>
            {view.canDelete && (
              <button
                type="button"
                aria-label={t("delete", { name: view.name })}
                disabled={removing}
                onClick={() => startRemoving(() => void deleteContactViewAction(view.id))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </span>
        );
      })}

      {/* Nothing to save when no filter is set — an unfiltered list is just
          /contacts, and naming it would be a bookmark to the front door. */}
      {activeQuery && (
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="query" value={activeQuery} />
          <Input
            name="name"
            placeholder={t("namePlaceholder")}
            aria-label={t("namePlaceholder")}
            className="h-8 w-44"
          />
          <Button type="submit" size="sm" variant="outline" disabled={saving}>
            {t("save")}
          </Button>
          {state.error && (
            <span role="alert" className="text-xs text-destructive">
              {t(`errors.${state.error}`)}
            </span>
          )}
        </form>
      )}
    </div>
  );
}
