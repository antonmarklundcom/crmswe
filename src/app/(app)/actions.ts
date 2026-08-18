"use server";

import { redirect } from "next/navigation";
import { stopImpersonation } from "@/modules/auth/impersonation";

/** "Volver a la consola" — the exit half of impersonation, which existed in
 * modules/auth but had no caller anywhere in the UI (PLAN.md §13 H4). */
export async function stopImpersonationAction() {
  await stopImpersonation();
  redirect("/tenants");
}
