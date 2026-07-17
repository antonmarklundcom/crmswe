import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { env } from "@/lib/config/env";
import type { StorageAdapter } from "./types";

// Bootstrap driver — Hostinger disk is non-durable, so this is meant to be
// swapped for the S3-compatible driver before onboarding external tenants
// (PLAN.md §2.1). Signed URLs are HMAC query tokens verified by whichever
// route serves the file (added alongside the module that needs it, e.g. 1D
// WhatsApp media) — this adapter only issues/validates the token.

const root = resolve(env.STORAGE_LOCAL_PATH);

function resolveKeyPath(key: string): string {
  const path = normalize(join(root, key));
  if (!path.startsWith(root)) {
    throw new Error(`Storage key escapes root: ${key}`);
  }
  return path;
}

export function signLocalKey(key: string, expiresAt: number): string {
  return createHmac("sha256", env.APP_ENCRYPTION_KEY)
    .update(`${key}:${expiresAt}`)
    .digest("hex");
}

export function verifyLocalSignature(
  key: string,
  expiresAt: number,
  signature: string,
): boolean {
  if (Date.now() > expiresAt) return false;
  const expected = Buffer.from(signLocalKey(key, expiresAt));
  const actual = Buffer.from(signature);
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

export const localStorage: StorageAdapter = {
  async put(key, data) {
    const path = resolveKeyPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  },

  async get(key) {
    return readFile(resolveKeyPath(key));
  },

  async getSignedUrl(key, expiresInSeconds = 3600) {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const signature = signLocalKey(key, expiresAt);
    const params = new URLSearchParams({
      key,
      expires: String(expiresAt),
      sig: signature,
    });
    return `/api/storage?${params.toString()}`;
  },

  async delete(key) {
    await rm(resolveKeyPath(key), { force: true });
  },
};
