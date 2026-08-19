import { NextResponse } from "next/server";
import { getTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";
import { searchTenant } from "@/modules/crm/search";
import { checkRateLimit } from "@/lib/rate-limit";
import { DEFAULT_COUNTRY } from "@/lib/phone";

// Backs the ⌘K palette (PLAN.md §13 H8). Session-scoped like the inbox
// endpoints: the tenant comes from the session, never from the request, so
// there is no tenant id to tamper with. Rate limited per user because the
// palette fires on every keystroke the debounce lets through.
export const dynamic = "force-dynamic";

const LIMIT = 60;
const WINDOW_MS = 60_000;

export async function GET(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (checkRateLimit(`search:${ctx.userId}`, LIMIT, WINDOW_MS).limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length < 2) return NextResponse.json({ query, hits: [] });

  const tenant = await getTenant(ctx.tenantId);
  const settings = (tenant?.settings ?? {}) as TenantSettings;

  const results = await searchTenant(
    ctx,
    query.slice(0, 100),
    settings.defaultCountry ?? DEFAULT_COUNTRY,
  );

  return NextResponse.json(results);
}
