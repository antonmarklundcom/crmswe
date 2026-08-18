import { describe, expect, it } from "vitest";
import { env } from "@/lib/config/env";
import { isValidCronSecret } from "./cron-secret";

describe("isValidCronSecret", () => {
  it("accepts the configured secret", () => {
    expect(isValidCronSecret(env.CRON_SECRET)).toBe(true);
  });

  it("rejects a wrong secret, a prefix of it, and a missing header", () => {
    expect(isValidCronSecret("nope")).toBe(false);
    expect(isValidCronSecret(env.CRON_SECRET.slice(0, -1))).toBe(false);
    expect(isValidCronSecret(`${env.CRON_SECRET}x`)).toBe(false);
    expect(isValidCronSecret(null)).toBe(false);
    expect(isValidCronSecret("")).toBe(false);
  });
});
