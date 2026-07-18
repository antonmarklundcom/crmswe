import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_ENCRYPTION_KEY: z
    .string()
    .length(64, "APP_ENCRYPTION_KEY must be a 32-byte hex string (64 chars)"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./.storage"),
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),
  // Better Auth session/cookie signing secret (distinct from APP_ENCRYPTION_KEY,
  // which is reserved for AES-256-GCM secrets-at-rest per §3.4).
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
});

export type Env = z.infer<typeof envSchema>;

// Validated once at module load — any code that imports this triggers a fast
// boot-time failure on misconfiguration instead of a runtime surprise later.
export const env: Env = envSchema.parse(process.env);
