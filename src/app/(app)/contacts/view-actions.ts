"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/modules/tenancy/context";
import {
  ContactViewNameTakenError,
  createContactView,
  deleteContactView,
} from "@/modules/crm/contact-views";
import { serializeContactView, type ContactSearchParams } from "./query";

// Saving the current filter set as a named view (PLAN.md §10 1J #1). Its own
// module rather than actions.ts so the client chip row can import the actions
// without pulling in the contact/WhatsApp action surface with them.

export type SaveViewState = {
  error: "nameRequired" | "nameTaken" | "unknown" | null;
  saved: boolean;
};

const saveViewSchema = z.object({
  name: z.string().min(1).max(100),
  query: z.string().max(1000),
});

export async function saveContactViewAction(
  _prevState: SaveViewState,
  formData: FormData,
): Promise<SaveViewState> {
  const ctx = await requireTenantContext();
  const parsed = saveViewSchema.safeParse({
    name: (formData.get("name") as string | null)?.trim() ?? "",
    query: formData.get("query") ?? "",
  });
  if (!parsed.success) return { error: "nameRequired", saved: false };

  // Re-serialized here, on the server, from the parsed pairs: the hidden
  // input came from the browser, so what gets stored is the filter keys the
  // list knows about and nothing else.
  const query = serializeContactView(
    Object.fromEntries(new URLSearchParams(parsed.data.query)) as ContactSearchParams,
  );

  try {
    await createContactView(ctx, { name: parsed.data.name, query });
  } catch (err) {
    if (err instanceof ContactViewNameTakenError) return { error: "nameTaken", saved: false };
    return { error: "unknown", saved: false };
  }

  revalidatePath("/contacts");
  return { error: null, saved: true };
}

export async function deleteContactViewAction(viewId: string): Promise<void> {
  const ctx = await requireTenantContext();
  const id = z.string().min(1).max(26).parse(viewId);
  await deleteContactView(ctx, id);
  revalidatePath("/contacts");
}
