import { describe, expect, it } from "vitest";
import { checkLoginAttempt, clientIp, isGuardedAuthPath } from "./login-rate-limit";

describe("isGuardedAuthPath", () => {
  it("covers the credential and password-reset endpoints", () => {
    expect(isGuardedAuthPath("/api/auth/sign-in/email")).toBe(true);
    expect(isGuardedAuthPath("/api/auth/forget-password")).toBe(true);
    expect(isGuardedAuthPath("/api/auth/reset-password")).toBe(true);
  });

  it("leaves the rest of Better Auth alone", () => {
    expect(isGuardedAuthPath("/api/auth/get-session")).toBe(false);
    expect(isGuardedAuthPath("/api/auth/sign-out")).toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("falls back to a shared bucket rather than to no limit", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("checkLoginAttempt", () => {
  it("blocks repeated attempts against one email", () => {
    const email = `victim-${Math.random()}@example.com`;
    let limited = false;
    for (let i = 0; i < 6; i++) {
      limited = checkLoginAttempt({ ip: `ip-${Math.random()}`, email });
      expect(limited).toBe(false);
    }
    expect(checkLoginAttempt({ ip: `ip-${Math.random()}`, email })).toBe(true);
  });

  it("blocks one IP spraying many emails", () => {
    const ip = `spray-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      expect(checkLoginAttempt({ ip, email: `user-${i}-${Math.random()}@example.com` })).toBe(false);
    }
    expect(checkLoginAttempt({ ip, email: `user-last-${Math.random()}@example.com` })).toBe(true);
  });
});
