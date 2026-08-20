// Signed URLs come out of the two drivers in two different shapes: the S3
// driver returns an absolute, publicly fetchable presigned URL, while the
// local driver returns an app-relative path carrying an HMAC token that
// whichever route serves the file has to verify (see local.ts). Anything that
// consumes a signed URL without knowing the driver — scripts/smoke-storage.ts
// today — needs to tell the two apart first.
//
// Pure and env-free on purpose, so it can be unit-tested without a configured
// environment (same reasoning as lib/money.ts).

export type ClassifiedSignedUrl =
  | { kind: "absolute"; url: string }
  | {
      kind: "appRelative";
      path: string;
      key: string;
      expiresAt: number;
      signature: string;
    }
  | { kind: "unrecognized"; url: string; reason: string };

export function classifySignedUrl(url: string): ClassifiedSignedUrl {
  if (/^https?:\/\//i.test(url)) return { kind: "absolute", url };

  if (!url.startsWith("/")) {
    return { kind: "unrecognized", url, reason: "neither an absolute URL nor an app-relative path" };
  }

  // A dummy origin: only the path and query matter, and URL needs a base to
  // parse a relative reference at all.
  const parsed = new URL(url, "http://placeholder.invalid");
  const key = parsed.searchParams.get("key");
  const expires = parsed.searchParams.get("expires");
  const signature = parsed.searchParams.get("sig");

  const missing = [
    key === null ? "key" : null,
    expires === null ? "expires" : null,
    signature === null ? "sig" : null,
  ].filter((name): name is string => name !== null);
  if (missing.length > 0) {
    return { kind: "unrecognized", url, reason: `missing query param(s): ${missing.join(", ")}` };
  }

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt)) {
    return { kind: "unrecognized", url, reason: `non-numeric expires: ${expires}` };
  }

  return { kind: "appRelative", path: parsed.pathname, key: key!, expiresAt, signature: signature! };
}
