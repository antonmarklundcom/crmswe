import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { tick } from "@/worker";
import { env } from "@/lib/config/env";

// Hostinger-pinged fallback tick (PLAN.md §2.2: "api/cron/ — Hostinger-pinged
// fallback tick (secret-guarded)"). The in-process worker (instrumentation.ts)
// already ticks every ~2s on its own — this exists only as a safety net for
// "no cron guarantees" (§2.1): if the Node process restarted without the
// worker's loop resuming, or under any other drift, an external cron hitting
// this URL keeps the jobs table draining. Claims and processes at most one
// job per call, same as a single worker tick.
export async function GET(request: Request) {
  const provided = request.headers.get("x-cron-secret");
  if (provided !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const didWork = await tick(`cron-${randomUUID()}`);
  return NextResponse.json({ didWork });
}
