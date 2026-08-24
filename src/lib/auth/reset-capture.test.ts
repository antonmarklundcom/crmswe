import { describe, expect, it } from "vitest";
import { captureResetUrl, withResetUrlCapture } from "./reset-capture";

// The correlation the superadmin "restablecer contraseña" action depends on:
// Better Auth's sendResetPassword hook has no return value the caller can
// read the reset URL from, so withResetUrlCapture/captureResetUrl thread it
// back out via AsyncLocalStorage instead.
describe("reset-capture", () => {
  it("returns the URL captured during the wrapped call", async () => {
    const { result, url } = await withResetUrlCapture(async () => {
      captureResetUrl("https://example.com/reset-password/tok123");
      return "inner result";
    });

    expect(result).toBe("inner result");
    expect(url).toBe("https://example.com/reset-password/tok123");
  });

  it("returns null when nothing was captured", async () => {
    const { url } = await withResetUrlCapture(async () => "no capture here");
    expect(url).toBeNull();
  });

  it("is a no-op outside of an active capture scope", () => {
    // The public /forgot-password flow shares the same sendResetPassword
    // hook and never wraps its call — this must not throw there.
    expect(() => captureResetUrl("https://example.com/reset-password/uncaptured")).not.toThrow();
  });

  it("keeps concurrent captures separate", async () => {
    const [a, b] = await Promise.all([
      withResetUrlCapture(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        captureResetUrl("https://example.com/a");
        return "a";
      }),
      withResetUrlCapture(async () => {
        captureResetUrl("https://example.com/b");
        return "b";
      }),
    ]);

    expect(a).toEqual({ result: "a", url: "https://example.com/a" });
    expect(b).toEqual({ result: "b", url: "https://example.com/b" });
  });
});
