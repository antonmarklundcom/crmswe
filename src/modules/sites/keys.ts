import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites } from "@/db/schema";

// API key handling for the ingest endpoint (PLAN.md §5.1).
//
// Keys are stored HASHED, never encrypted: nothing ever needs to read a key
// back, only compare one. SHA-256 rather than a slow KDF because the key is
// 32 bytes of CSPRNG output, not a human password — there is no dictionary
// to defend against, and ingest verifies a key on every request.

const KEY_PREFIX = "vc_live_";

export type GeneratedApiKey = {
  /** Full key — returned exactly once, at creation, and never stored. */
  plaintext: string;
  hash: string;
  displayPrefix: string;
};

export function generateApiKey(): GeneratedApiKey {
  const plaintext = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    displayPrefix: plaintext.slice(0, 16),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Ingest routing (§5.1): key → site → tenant. Runs before any TenantContext
 * can exist — structurally identical to the WhatsApp webhook's
 * phone_number_id lookup (§6.3), and covered by the same lint exemption.
 *
 * The lookup is by hash, so it's a single indexed equality match rather than
 * a scan-and-compare; the constant-time compare below is belt-and-braces
 * against a storage layer that might return a near-match.
 */
export async function resolveSiteByApiKey(plaintext: string) {
  if (!plaintext.startsWith(KEY_PREFIX)) return null;

  const hash = hashApiKey(plaintext);
  const [site] = await db.select().from(sites).where(eq(sites.apiKeyHash, hash));
  if (!site) return null;

  const a = Buffer.from(site.apiKeyHash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return site;
}
