import { redirect } from "next/navigation";

// Kept so any already-indexed or bookmarked /contacto link still resolves
// after the slug moved to /kontakt (plan.md §6.2).
export default function ContactoRedirect() {
  redirect("/kontakt");
}
