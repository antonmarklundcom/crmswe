import { describe, expect, it } from "vitest";
import { forceIpv4Loopback } from "./url";

// Regression guard for the first-deploy blocker: `localhost` in DATABASE_URL
// resolves to ::1 on Node 18+, and Hostinger's MySQL grants the app user only
// `@localhost`/`@127.0.0.1`, so the app was rejected with "Access denied ...
// (using password: YES)" and every DB-touching route returned an empty 500.
describe("forceIpv4Loopback", () => {
  it("pins a localhost host to 127.0.0.1", () => {
    expect(forceIpv4Loopback("mysql://u:p@localhost:3306/db")).toBe(
      "mysql://u:p@127.0.0.1:3306/db",
    );
  });

  it("pins an explicit IPv6 loopback host too", () => {
    expect(forceIpv4Loopback("mysql://u:p@[::1]:3306/db")).toBe(
      "mysql://u:p@127.0.0.1:3306/db",
    );
  });

  it("leaves a remote host untouched", () => {
    const url = "mysql://u:p@srv1724.hstgr.io:3306/db";
    expect(forceIpv4Loopback(url)).toBe(url);
  });

  it("leaves an unparseable connection string untouched", () => {
    expect(forceIpv4Loopback("not a url")).toBe("not a url");
  });
});
