import { mysqlTable, char, varchar, datetime, index, uniqueIndex, text } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Better Auth core tables (Drizzle adapter, admin plugin) — platform-level,
// no tenant_id (PLAN.md §3.1). `users` (schema/tenancy.ts) is the Better
// Auth `user` table; these three round out the adapter's required schema.

export const sessions = mysqlTable(
  "sessions",
  {
    id: char("id", { length: 26 }).primaryKey(),
    userId: char("user_id", { length: 26 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: datetime("expires_at").notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 500 }),
    // Better Auth admin plugin: real superadmin id while impersonating.
    impersonatedBy: char("impersonated_by", { length: 26 }),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("sessions_token_idx").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const accounts = mysqlTable(
  "accounts",
  {
    id: char("id", { length: 26 }).primaryKey(),
    userId: char("user_id", { length: 26 }).notNull(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 100 }).notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: datetime("access_token_expires_at"),
    refreshTokenExpiresAt: datetime("refresh_token_expires_at"),
    scope: varchar("scope", { length: 500 }),
    password: varchar("password", { length: 255 }),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = mysqlTable(
  "verifications",
  {
    id: char("id", { length: 26 }).primaryKey(),
    identifier: varchar("identifier", { length: 320 }).notNull(),
    value: varchar("value", { length: 500 }).notNull(),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);
