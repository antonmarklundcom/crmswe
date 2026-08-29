import { redirect } from "next/navigation";

// Kept so any already-shared or bookmarked /gracias link still resolves
// after the slug moved to /tack (plan.md §6.1.3).
export default async function GraciasRedirect({
  params,
}: {
  params: Promise<{ tenantSlug: string; formSlug: string }>;
}) {
  const { tenantSlug, formSlug } = await params;
  redirect(`/f/${tenantSlug}/${formSlug}/tack`);
}
