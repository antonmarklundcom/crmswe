import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Guarded like lib/storage/local.test.ts: the route imports the shared env
// module (STORAGE_DRIVER, APP_ENCRYPTION_KEY, STORAGE_LOCAL_PATH), which also
// requires DATABASE_URL etc., so it can only be imported in a configured env.
const hasEnv = !!process.env.APP_ENCRYPTION_KEY && !!process.env.DATABASE_URL;

// Must stay in sync with RATE_LIMIT in route.ts — the test asserts the trip
// happens at that boundary, so a change there should fail here on purpose.
const RATE_LIMIT = 120;

describe.skipIf(!hasEnv)("GET /api/storage", () => {
  let route: typeof import("./route");
  let local: typeof import("@/lib/storage/local");
  let storageDir: string;

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "vendercrm-storage-route-"));
    process.env.STORAGE_LOCAL_PATH = storageDir;
    process.env.STORAGE_DRIVER = "local";
    local = await import("@/lib/storage/local");
    route = await import("./route");
  });

  afterAll(async () => {
    await rm(storageDir, { recursive: true, force: true });
  });

  // Each test gets its own IP so it starts with a fresh bucket — the limiter
  // is process-global and buckets outlive a single test.
  function request(path: string, ip: string): Request {
    return new Request(`http://localhost:3000${path}`, {
      headers: { "x-forwarded-for": ip },
    });
  }

  function signedPath(key: string, expiresAt = Date.now() + 60_000): string {
    const sig = local.signLocalKey(key, expiresAt);
    return `/api/storage?key=${encodeURIComponent(key)}&expires=${expiresAt}&sig=${sig}`;
  }

  it("serves a validly signed object with its stored content type", async () => {
    const key = "route-test/served.png";
    await local.localStorage.put(key, Buffer.from("payload"), "image/png");

    const response = await route.GET(request(signedPath(key), "10.0.0.1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("payload");
  });

  it("still returns 404, not 429, for a forged signature under the limit", async () => {
    const key = "route-test/served.png";
    const expiresAt = Date.now() + 60_000;
    const forged = `/api/storage?key=${encodeURIComponent(key)}&expires=${expiresAt}&sig=deadbeef`;

    const response = await route.GET(request(forged, "10.0.0.2"));

    expect(response.status).toBe(404);
  });

  it("rate-limits signature guesses before verifying them", async () => {
    const ip = "10.0.0.3";
    const expiresAt = Date.now() + 60_000;
    const guess = (n: number) =>
      request(`/api/storage?key=secret.bin&expires=${expiresAt}&sig=${n}`, ip);

    for (let i = 0; i < RATE_LIMIT; i++) {
      expect((await route.GET(guess(i))).status).toBe(404);
    }

    const blocked = await route.GET(guess(RATE_LIMIT));
    expect(blocked.status).toBe(429);
  });

  it("rate-limits valid fetches too, and only for the offending IP", async () => {
    const key = "route-test/served.png";
    const flooding = "10.0.0.4";
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect((await route.GET(request(signedPath(key), flooding))).status).toBe(200);
    }

    expect((await route.GET(request(signedPath(key), flooding))).status).toBe(429);
    expect((await route.GET(request(signedPath(key), "10.0.0.5"))).status).toBe(200);
  });
});
