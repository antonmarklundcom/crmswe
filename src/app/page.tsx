import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { auth } from "@/lib/auth/server";
import MarketingPage, { marketingMetadata } from "./_marketing/MarketingPage";

// Same Node app answers both the apex marketing domain and the crm.*
// subdomain (parked domain, shared document root — see hPanel Domains).
// Only the crm.* host runs the CRM itself; every other host (apex,
// www., Hostinger's own preview hostname) gets the marketing site.
const APP_HOST_PREFIX = "crm.";

async function isMarketingHost() {
  const host = (await headers()).get("host") ?? "";
  return !host.startsWith(APP_HOST_PREFIX);
}

// The two hosts need different titles and descriptions, and the CRM must not
// be indexed at all — so metadata is resolved per request rather than static.
export async function generateMetadata(): Promise<Metadata> {
  if (await isMarketingHost()) {
    return {
      ...marketingMetadata,
      alternates: { canonical: "https://clientes.com.py/" },
    };
  }
  return { title: "VenderCRM", robots: { index: false, follow: false } };
}

// "/" carries no session guard of its own — (app)/layout.tsx and
// (superadmin)/layout.tsx each redirect to /login when unauthenticated, but
// only once you're already inside one of those route groups. Route straight
// to the right area (or /login) instead of showing a bare landing page.
export default async function Home() {
  if (await isMarketingHost()) {
    return <MarketingPage />;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user as { isSuperadmin?: boolean | null } | undefined;

  if (!session) redirect("/login");
  redirect(user?.isSuperadmin ? "/tenants" : "/dashboard");
}
