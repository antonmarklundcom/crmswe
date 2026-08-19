import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/db/health";
import { env } from "@/lib/config/env";
import { requireCronSecret } from "@/lib/api/guards";

// Deploy diagnostic (docs/DEPLOY.md §8). In production Next.js returns an
// empty HTTP 500 for any unhandled error, so a bad DATABASE_URL looks
// identical to a bug in the route — sign-in in particular fails with a blank
// 500 and the login form shows only its generic "wrong credentials" string.
// This endpoint reports the driver's real error code instead. Guarded by the
// same `x-cron-secret` header as /api/cron/tick, and it never echoes the
// password back.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = requireCronSecret(request);
  if (!guard.ok) return guard.response;

  const database = await checkDatabaseConnection();
  return NextResponse.json(
    { ok: database.ok, appUrl: env.APP_URL, database },
    { status: database.ok ? 200 : 503 },
  );
}
