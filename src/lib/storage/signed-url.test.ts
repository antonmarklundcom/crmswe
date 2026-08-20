import { describe, expect, it } from "vitest";
import { classifySignedUrl } from "./signed-url";

describe("classifySignedUrl", () => {
  it("treats an S3 presigned URL as absolute and fetchable", () => {
    const url =
      "https://abc123.r2.cloudflarestorage.com/bucket/key.txt?X-Amz-Signature=deadbeef";
    expect(classifySignedUrl(url)).toEqual({ kind: "absolute", url });
  });

  it("parses the local driver's app-relative token URL", () => {
    const result = classifySignedUrl("/api/storage?key=a%2Fb.txt&expires=1750000000000&sig=abc");
    expect(result).toEqual({
      kind: "appRelative",
      path: "/api/storage",
      key: "a/b.txt",
      expiresAt: 1750000000000,
      signature: "abc",
    });
  });

  it("names the missing params rather than guessing", () => {
    const result = classifySignedUrl("/api/storage?key=a.txt");
    expect(result.kind).toBe("unrecognized");
    if (result.kind === "unrecognized") {
      expect(result.reason).toContain("expires");
      expect(result.reason).toContain("sig");
    }
  });

  it("rejects a non-numeric expiry", () => {
    const result = classifySignedUrl("/api/storage?key=a.txt&expires=soon&sig=abc");
    expect(result.kind).toBe("unrecognized");
  });

  it("rejects something that is neither absolute nor rooted", () => {
    expect(classifySignedUrl("api/storage?key=a").kind).toBe("unrecognized");
  });
});
