"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/form-fields";
import { searchContactsForEventAction } from "./actions";

// Type-ahead contact field for the booking form. The value the form submits
// is the hidden input; the visible box is only how you find it, which is why
// typing after a selection clears it — a name in the box that no longer
// matches the id underneath is the one state this must never be in.

export type PickedContact = { id: string; name: string };

export function ContactPicker({ name, initial }: { name: string; initial?: PickedContact | null }) {
  const t = useTranslations("app.calendar.form");
  const [selected, setSelected] = useState<PickedContact | null>(initial ?? null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [searching, startSearching] = useTransition();

  useEffect(() => {
    if (selected || term.trim().length < 2) {
      setResults([]);
      return;
    }
    // Debounced: a query per keystroke would put the whole contact table
    // through a server action on every letter.
    const timer = setTimeout(() => {
      startSearching(async () => setResults(await searchContactsForEventAction(term)));
    }, 250);
    return () => clearTimeout(timer);
  }, [term, selected]);

  if (selected) {
    return (
      <span className="flex items-center gap-2">
        <input type="hidden" name={name} value={selected.id} />
        <span className="rounded-md border bg-card px-3 py-2 text-sm">{selected.name}</span>
        <button
          type="button"
          aria-label={t("clearContact")}
          onClick={() => {
            setSelected(null);
            setTerm("");
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </span>
    );
  }

  return (
    <span className="relative flex flex-col gap-1">
      {/* Empty on purpose while nothing is picked: no contact is a valid
          answer, and the server reads "" as exactly that. */}
      <input type="hidden" name={name} value="" />
      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t("searchContact")}
        aria-label={t("contact")}
        autoComplete="off"
      />
      {term.trim().length >= 2 && (
        <span className="absolute top-full z-10 mt-1 flex w-full flex-col rounded-md border bg-popover shadow-md">
          {results.length === 0 ? (
            <span className="px-3 py-2 text-sm text-muted-foreground">
              {searching ? t("searching") : t("noMatches")}
            </span>
          ) : (
            results.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => setSelected({ id: contact.id, name: contact.name })}
                className="flex items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span>{contact.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{contact.phone}</span>
              </button>
            ))
          )}
        </span>
      )}
    </span>
  );
}
