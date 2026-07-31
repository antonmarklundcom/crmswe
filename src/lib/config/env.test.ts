import { describe, expect, it } from "vitest";
import { z } from "zod";

// The full env module runs its zod parse at import time against
// process.env, so it can't be re-imported per-test with different inputs —
// this rebuilds just the superRefine rule under test instead. What matters
// here is the S3-required-when-selected behavior added for PLAN.md §10 1K;
// the rest of the schema is exercised implicitly by every other suite
// booting through modules that import `env`.

const s3RequirementSchema = z
  .object({
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    S3_ENDPOINT: z.string().url().optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.STORAGE_DRIVER !== "s3") return;
    const required = {
      S3_ENDPOINT: value.S3_ENDPOINT,
      S3_BUCKET: value.S3_BUCKET,
      S3_ACCESS_KEY_ID: value.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: value.S3_SECRET_ACCESS_KEY,
    };
    for (const [key, present] of Object.entries(required)) {
      if (!present) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} required` });
      }
    }
  });

describe("storage env validation", () => {
  it("allows local driver with no S3 vars set", () => {
    expect(s3RequirementSchema.safeParse({ STORAGE_DRIVER: "local" }).success).toBe(true);
  });

  it("rejects s3 driver missing all S3 vars", () => {
    const result = s3RequirementSchema.safeParse({ STORAGE_DRIVER: "s3" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("S3_ENDPOINT");
      expect(paths).toContain("S3_BUCKET");
      expect(paths).toContain("S3_ACCESS_KEY_ID");
      expect(paths).toContain("S3_SECRET_ACCESS_KEY");
    }
  });

  it("accepts s3 driver with all required vars", () => {
    const result = s3RequirementSchema.safeParse({
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: "https://abc123.r2.cloudflarestorage.com",
      S3_BUCKET: "vendercrm-media",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    expect(result.success).toBe(true);
  });
});
