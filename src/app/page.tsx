import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";

// "/" carries no session guard of its own — (app)/layout.tsx and
// (superadmin)/layout.tsx each redirect to /login when unauthenticated, but
// only once you're already inside one of those route groups. Route straight
// to the right area (or /login) instead of showing a bare landing page.
export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user as { isSuperadmin?: boolean | null } | undefined;

  if (!user) redirect("/login");
  redirect(user.isSuperadmin ? "/tenants" : "/dashboard");
}
