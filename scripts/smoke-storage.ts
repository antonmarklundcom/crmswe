import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { storage } from "@/lib/storage";
import { verifyLocalSignature } from "@/lib/storage/local";
import { classifySignedUrl } from "@/lib/storage/signed-url";

// Storage smoke test (PLAN.md §10 1R operator tasks, 1K's live check). Runs
// the full object lifecycle against whichever driver STORAGE_DRIVER selects:
// put a key, read it back, sign a URL, prove the signed URL works, delete,
// confirm it's gone.
//
// Deliberately driver-agnostic so it can be run today against
// STORAGE_DRIVER=local and re-run unchanged the day the R2 bucket exists —
// the point is that the same lifecycle is proven for whatever is configured,
// not that one provider is reachable.
//
// The one place the drivers genuinely differ is the signed URL: S3 returns an
// absolute, fetchable presigned URL, while the local driver returns an
// app-relative path carrying an HMAC token for a serving route to verify. See
// step 4.
//
// Usage:
//   npx tsx scripts/smoke-storage.ts
//
// Optional:
//   SMOKE_STORAGE_PREFIX=smoke-test/   key prefix to write under
//   SMOKE_STORAGE_BASE_URL=https://…   origin to resolve an app-relative
//                                      signed URL against, when the app is
//                                      running and serves that route

const configSchema = z.object({
  SMOKE_STORAGE_PREFIX: z.string().min(1).default("smoke-test/"),
  SMOKE_STORAGE_BASE_URL: z.string().url().optional(),
});

type StepOutcome = "pass" | "fail" | "skip";
const results: { name: string; outcome: StepOutcome; detail: string }[] = [];

async function step(name: string, run: () => Promise<string | { skip: string }>) {
  // A failed step is recorded and rethrown: the lifecycle is a chain (there is
  // nothing to read back if the put failed), so the run stops at the first
  // failure rather than reporting a cascade of consequences as findings.
  try {
    const outcome = await run();
    if (typeof outcome === "object") {
      results.push({ name, outcome: "skip", detail: outcome.skip });
      console.log(`SKIP  ${name} — ${outcome.skip}`);
      return;
    }
    results.push({ name, outcome: "pass", detail: outcome });
    console.log(`PASS  ${name} — ${outcome}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, outcome: "fail", detail });
    console.log(`FAIL  ${name} — ${detail}`);
    throw error;
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<number> {
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      console.error(`${issue.path.join(".") || "config"}: ${issue.message}`);
    }
    return 2;
  }
  const config = parsed.data;

  const key = `${config.SMOKE_STORAGE_PREFIX}${randomUUID()}.bin`;
  // Random bytes rather than a fixed string: a driver that returns a cached or
  // wrong object still has to produce these exact 256 bytes to pass step 2.
  const payload = randomBytes(256);

  console.log(`Storage smoke test — driver: ${env.STORAGE_DRIVER}`);
  console.log(
    env.STORAGE_DRIVER === "s3"
      ? `Target: ${env.S3_BUCKET} @ ${env.S3_ENDPOINT}`
      : `Target: ${env.STORAGE_LOCAL_PATH}`,
  );
  console.log(`Key: ${key}\n`);

  let putSucceeded = false;
  try {
    await step("1. put", async () => {
      await storage.put(key, payload, "application/octet-stream");
      putSucceeded = true;
      return `wrote ${payload.byteLength} bytes`;
    });

    await step("2. get returns the same bytes", async () => {
      const read = await storage.get(key);
      assert(
        read.byteLength === payload.byteLength,
        `read back ${read.byteLength} bytes, wrote ${payload.byteLength}`,
      );
      assert(read.equals(payload), "read back the right length but different bytes");
      return `${read.byteLength} bytes, byte-identical`;
    });

    let signed = "";
    await step("3. getSignedUrl", async () => {
      signed = await storage.getSignedUrl(key, 300);
      assert(signed.length > 0, "driver returned an empty URL");
      return signed.length > 120 ? `${signed.slice(0, 120)}…` : signed;
    });

    const classified = classifySignedUrl(signed);

    await step("4. signed URL serves the object", async () => {
      if (classified.kind === "unrecognized") {
        throw new Error(`signed URL is unusable: ${classified.reason}`);
      }

      if (classified.kind === "absolute") {
        const response = await fetch(classified.url);
        assert(response.ok, `HTTP ${response.status} ${response.statusText}`);
        const fetched = Buffer.from(await response.arrayBuffer());
        assert(fetched.equals(payload), `fetched ${fetched.byteLength} bytes, not the ones written`);
        return `HTTP ${response.status}, ${fetched.byteLength} bytes, byte-identical`;
      }

      // App-relative (local driver): the URL is an HMAC token, so what's
      // verifiable without a running app is the token contract itself — that a
      // serving route would accept this one and reject a forged or expired
      // one. The HTTP leg is step 5.
      assert(classified.key === key, `token names key ${classified.key}, not ${key}`);
      assert(
        verifyLocalSignature(classified.key, classified.expiresAt, classified.signature),
        "the driver's own signature did not verify",
      );
      assert(
        !verifyLocalSignature(classified.key, classified.expiresAt, `${classified.signature}00`),
        "a tampered signature verified — the token is forgeable",
      );
      assert(
        !verifyLocalSignature(classified.key, Date.now() - 1000, classified.signature),
        "an expired token verified — expiry is not enforced",
      );
      return "token verifies; forged and expired tokens rejected";
    });

    await step("5. signed URL over HTTP", async () => {
      if (classified.kind === "absolute") {
        return { skip: "already fetched over HTTP in step 4" };
      }
      if (classified.kind === "unrecognized") {
        return { skip: "no usable signed URL to fetch" };
      }
      const base = config.SMOKE_STORAGE_BASE_URL;
      if (!base) {
        return {
          skip:
            "app-relative URL and no SMOKE_STORAGE_BASE_URL — set it to a running app's origin to " +
            "exercise the HTTP leg (note: nothing in this repo serves that route yet)",
        };
      }
      const response = await fetch(new URL(signed, base));
      assert(response.ok, `HTTP ${response.status} ${response.statusText}`);
      const fetched = Buffer.from(await response.arrayBuffer());
      assert(fetched.equals(payload), `fetched ${fetched.byteLength} bytes, not the ones written`);
      return `HTTP ${response.status}, ${fetched.byteLength} bytes, byte-identical`;
    });

    await step("6. delete", async () => {
      await storage.delete(key);
      return "deleted";
    });

    await step("7. get after delete rejects", async () => {
      let read: Buffer | null = null;
      try {
        read = await storage.get(key);
      } catch (error) {
        // Only now is the object known to be gone, so the cleanup below has
        // nothing left to do — a delete the driver accepted while the object
        // stayed readable is exactly the case worth re-attempting.
        putSucceeded = false;
        return `rejected: ${error instanceof Error ? error.message : String(error)}`;
      }
      throw new Error(`still readable after delete — got ${read.byteLength} bytes`);
    });
  } catch {
    // Already reported by step(); fall through to the summary.
  } finally {
    if (putSucceeded) {
      // A run that failed midway must not leave its object behind — the next
      // run would otherwise be polluting the bucket a little at a time.
      await storage.delete(key).catch((error: unknown) => {
        console.error(`Cleanup of ${key} failed: ${error}`);
      });
    }
  }

  const failed = results.filter((result) => result.outcome === "fail");
  const skipped = results.filter((result) => result.outcome === "skip");
  console.log("");
  if (skipped.length > 0) {
    console.log(`${skipped.length} step(s) skipped: ${skipped.map((s) => s.name).join(", ")}`);
  }
  if (failed.length > 0) {
    console.log(`FAILED: ${failed.map((f) => `${f.name} (${f.detail})`).join("; ")}`);
    return 1;
  }
  console.log(
    `All ${results.length - skipped.length} executed step(s) passed — storage driver ` +
      `"${env.STORAGE_DRIVER}" is usable.`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(2);
  });
