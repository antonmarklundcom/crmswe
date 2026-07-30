import { pool } from "./client";
import { forceIpv4Loopback } from "./url";
import { env } from "@/lib/config/env";

export type DatabaseCheck = {
  ok: boolean;
  /** Where we actually connected — never includes the password. */
  target: { host: string; port: string; user: string; database: string } | null;
  error?: { code?: string; errno?: number; message: string };
};

/**
 * Connectivity probe for the deploy runbook (docs/DEPLOY.md §8): opens a real
 * connection and runs `SELECT 1`, reporting the driver's own error code
 * instead of the empty 500 Next.js returns in production.
 */
export async function checkDatabaseConnection(): Promise<DatabaseCheck> {
  const url = forceIpv4Loopback(env.DATABASE_URL);
  let target: DatabaseCheck["target"] = null;
  try {
    const parsed = new URL(url);
    target = {
      host: parsed.hostname,
      port: parsed.port || "3306",
      user: decodeURIComponent(parsed.username),
      database: parsed.pathname.replace(/^\//, ""),
    };
  } catch {
    // Leave target null — an unparseable URL is itself the finding.
  }

  try {
    const conn = await pool.getConnection();
    try {
      await conn.query("SELECT 1");
    } finally {
      conn.release();
    }
    return { ok: true, target };
  } catch (error) {
    const err = error as { code?: string; errno?: number; message?: string };
    return {
      ok: false,
      target,
      error: {
        code: err.code,
        errno: err.errno,
        message: err.message ?? String(error),
      },
    };
  }
}
