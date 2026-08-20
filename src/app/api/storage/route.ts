import { env } from "@/lib/config/env";
import { getLocalContentType, verifyLocalSignature } from "@/lib/storage/local";
import { classifySignedUrl } from "@/lib/storage/signed-url";
import { storage } from "@/lib/storage";

// Serves the local driver's signed URLs (see lib/storage/local.ts). Same
// capability model as the public quote view /q/[token] (§8): the signature
// in the query string IS the auth — unguessable + expiring, no session or
// tenant check here, by design. The S3 driver never points here; its
// presigned URLs are absolute and fetched straight from the bucket.
export async function GET(request: Request) {
  if (env.STORAGE_DRIVER !== "local") {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const classified = classifySignedUrl(`${url.pathname}${url.search}`);

  // Every failure mode below — bad params, forged sig, expired token, missing
  // object — returns the same 404 so the route never reveals which keys
  // exist or why a given URL didn't work.
  if (classified.kind !== "appRelative") {
    return new Response("Not found", { status: 404 });
  }

  const { key, expiresAt, signature } = classified;
  if (!verifyLocalSignature(key, expiresAt, signature)) {
    return new Response("Not found", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await storage.get(key);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const contentType = (await getLocalContentType(key)) ?? "application/octet-stream";

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
    },
  });
}
