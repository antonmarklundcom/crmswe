import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    APP_ENCRYPTION_KEY: z
      .string()
      .length(64, "APP_ENCRYPTION_KEY must be a 32-byte hex string (64 chars)"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_PATH: z.string().default("./.storage"),
    // S3-compatible driver (PLAN.md §10 1K) — Cloudflare R2 is the intended
    // target: free egress, S3 API compatibility, no code specific to R2
    // beyond the endpoint URL. Optional at the schema level and required in
    // practice only when STORAGE_DRIVER=s3 (checked below) — keeping them
    // optional here means a tenant that never sets STORAGE_DRIVER doesn't
    // need to touch these at all.
    S3_ENDPOINT: z.string().url().optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    // R2 has no regions; the SDK still requires a value, and "auto" is what
    // Cloudflare's own docs tell every client to send.
    S3_REGION: z.string().default("auto"),
    CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),
    // Better Auth session/cookie signing secret (distinct from APP_ENCRYPTION_KEY,
    // which is reserved for AES-256-GCM secrets-at-rest per §3.4).
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    WHATSAPP_APP_SECRET: z.string().min(1, "WHATSAPP_APP_SECRET is required"),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z
      .string()
      .min(1, "WHATSAPP_WEBHOOK_VERIFY_TOKEN is required"),
    // Transactional email (PLAN.md §10 1M). Optional, same pattern as Sentry
    // in next.config.ts: absent means email sending no-ops (logs instead of
    // throwing) rather than the app refusing to boot. Lets every environment
    // — local dev, CI, a fresh prod deploy before DNS is warmed — run without
    // it, at the cost of invites/reset links only being usable via the
    // on-screen copy link until it's configured.
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
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
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_DRIVER=s3`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

// Validated once at module load — any code that imports this triggers a fast
// boot-time failure on misconfiguration instead of a runtime surprise later.
export const env: Env = envSchema.parse(process.env);
