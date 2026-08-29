import { redirect } from "next/navigation";

// Kept so any already-indexed or bookmarked /nosotros link still resolves
// after the slug moved to /om-oss (plan.md §6.2).
export default function NosotrosRedirect() {
  redirect("/om-oss");
}
