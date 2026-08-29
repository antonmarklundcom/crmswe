import { redirect } from "next/navigation";

// Kept so any already-indexed or bookmarked /metodo link still resolves
// after the slug moved to /sa-funkar-det (plan.md §6.2).
export default function MetodoRedirect() {
  redirect("/sa-funkar-det");
}
