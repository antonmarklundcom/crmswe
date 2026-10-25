import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./push-endpoint";

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc123:APA91bH",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk",
    "https://updates-autopush.stage.push.services.mozilla.com/wpush/v2/x",
    "https://web.push.apple.com/QGxyz",
    "https://api.push.apple.com/3/device/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://db5p.notify.windows.com/w/?token=abc",
  ])("accepts %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://169.254.169.254/latest",
    "https://localhost/x",
    "https://evil.example/x",
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://user:pass@fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://fcm.googleapis.com.evil.example/x",
    "https://evilfcm.googleapis.com/x",
    "https://push.apple.com/x",
    "https://notify.windows.com/x",
    "https://evilpush.apple.com/x",
    "https://127.0.0.1/x",
    "https://[::1]/x",
    "not a url",
  ])("rejects %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
