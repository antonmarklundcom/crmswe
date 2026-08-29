import {
  mysqlTable,
  char,
  varchar,
  int,
  bigint,
  boolean,
  json,
  datetime,
  index,
  uniqueIndex,
  text,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Platform-level tenancy & billing tables (PLAN.md §3.1, §4 "tenancy/billing").
// Manual billing only in Phase 1: superadmin records payments; no gateway.

export const tenants = mysqlTable(
  "tenants",
  {
    id: char("id", { length: 26 }).primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    status: varchar("status", {
      length: 20,
      enum: ["active", "suspended", "trial"],
    })
      .notNull()
      .default("trial"),
    locale: varchar("locale", { length: 10 }).notNull().default("sv"),
    timezone: varchar("timezone", { length: 60 })
      .notNull()
      .default("Europe/Stockholm"),
    /**
     * The tenant's own currency (plan.md §1.3). Every service that creates a
     * priced row defaults to it, and every amount stored anywhere in this
     * tenant's data is minor units of it — öre for SEK. A typed column rather
     * than a settings key because it decides how numbers are read, not how
     * they look.
     */
    currency: char("currency", { length: 3 }).notNull().default("SEK"),
    // --- Företagsuppgifter (plan.md §2). Typed columns rather than settings
    // JSON: these print on every faktura, are searched, and two of them are
    // identifiers a validator has an opinion about. All nullable, because a
    // trial tenant has not filled them in yet and must still be able to work.
    /** Canonical 10 digits, no hyphen — format with lib/se/identity. */
    orgNr: varchar("org_nr", { length: 12 }),
    /** Usually SE + org.nr + 01, but stored rather than derived: group
     * registrations and foreign registrations exist. */
    momsRegNr: varchar("moms_reg_nr", { length: 20 }),
    bankgiro: varchar("bankgiro", { length: 20 }),
    plusgiro: varchar("plusgiro", { length: 20 }),
    /** "Godkänd för F-skatt" — printed on the faktura when true. */
    fskatt: boolean("f_skatt").notNull().default(false),
    /** Default betalvillkor in days; 30 is the Swedish B2B norm, and it is a
     * default here rather than a constant in the invoice code so a tenant can
     * change it. */
    paymentTermsDays: int("payment_terms_days").notNull().default(30),
    invoiceFooter: text("invoice_footer"),
    settings: json("settings").notNull().default({}),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("tenants_slug_idx").on(table.slug)],
);

// One row per person on the platform, keyed by a globally unique email.
// Doubles as the Better Auth `user` table (email, name, emailVerified, image
// are Better Auth core fields).
//
// Which businesses a person can work in no longer lives here: that is
// `tenant_memberships` below (PLAN.md §3.1, reopened — one user may hold a
// membership in many tenants, with a role per membership). `tenant_id` on
// this row survives with a narrower meaning: it is the *active* business for
// this user's session, the one the switcher last put them in. It is a
// pointer, never a grant — `getTenantContext` re-checks it against a live
// membership on every request, so a stale value grants nothing.
export const users = mysqlTable(
  "users",
  {
    id: char("id", { length: 26 }).primaryKey(),
    /** Active business (see comment above). NULL for superadmins, and for a
     * member whose last active business was taken away from them. */
    tenantId: char("tenant_id", { length: 26 }),
    email: varchar("email", { length: 320 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    name: varchar("name", { length: 200 }).notNull(),
    image: varchar("image", { length: 2000 }),
    // Better Auth's admin-plugin `adminRoles` gate (§3.2) keys off this field
    // for its own /api/auth/admin/* endpoints, so superadmins carry
    // role="superadmin" here as defense-in-depth. The app's own authorization
    // never trusts it: `isSuperadmin` below decides platform powers, and the
    // *tenant* role is read from `tenant_memberships.role` for the active
    // business, never from this column (PLAN.md §3.3). It is kept in sync
    // with the active membership only so the admin plugin sees a sane value.
    role: varchar("role", { length: 20, enum: ["admin", "agent", "superadmin"] }),
    isSuperadmin: boolean("is_superadmin").notNull().default(false),
    // Better Auth admin plugin ban fields.
    banned: boolean("banned").notNull().default(false),
    banReason: varchar("ban_reason", { length: 500 }),
    banExpires: datetime("ban_expires"),
    // UI language for this user (PLAN.md §13 H5). Null = follow the tenant's
    // locale, which is the default for everyone until they choose otherwise
    // — `sv` stays the reference locale (plan.md §1.11), this is a
    // preference on top of it, not a second product.
    locale: varchar("locale", { length: 10 }),
    // Daily "your tasks are due" email (PLAN.md §13 H6). Opt-out, not
    // opt-in: a reminder nobody switched on is a reminder nobody gets, and
    // the whole point is that follow-up happens without being remembered.
    taskReminders: boolean("task_reminders").notNull().default(true),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    index("users_tenant_id_idx").on(table.tenantId),
  ],
);

// One row per (user, business) pairing — the grant that says this person may
// act in this tenant, and in what role (PLAN.md §3.1, reopened; §11's
// "multi-tenant users" is no longer deferred).
//
// Role is a property of the *pairing*, not of the person: the same user can be
// `admin` at one business and `agent` at another. That is also why deactivation
// lives here rather than on `users` — banning someone at one business must not
// lock them out of the others. `users.banned` stays what it always was: a
// platform-wide ban, superadmin's tool, orthogonal to this.
export const tenantMemberships = mysqlTable(
  "tenant_memberships",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    userId: char("user_id", { length: 26 }).notNull(),
    role: varchar("role", { length: 20, enum: ["admin", "agent"] }).notNull(),
    // Per-business deactivation (PLAN.md §13 H4, moved off `users`).
    banned: boolean("banned").notNull().default(false),
    banReason: varchar("ban_reason", { length: 500 }),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    // A person is in a business once, with one role — the pairing is the key.
    uniqueIndex("tenant_memberships_tenant_user_idx").on(table.tenantId, table.userId),
    index("tenant_memberships_user_id_idx").on(table.userId),
  ],
);

export const invitations = mysqlTable(
  "invitations",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    role: varchar("role", { length: 20, enum: ["admin", "agent"] }).notNull(),
    token: varchar("token", { length: 64 }).notNull(),
    invitedBy: char("invited_by", { length: 26 }).notNull(),
    acceptedAt: datetime("accepted_at"),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("invitations_token_idx").on(table.token),
    index("invitations_tenant_id_idx").on(table.tenantId),
    index("invitations_tenant_email_idx").on(table.tenantId, table.email),
  ],
);

export const plans = mysqlTable("plans", {
  id: char("id", { length: 26 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  // 3, 6, or 12 months — enforced by zod in the service layer (§1.2 prepay-only).
  durationMonths: int("duration_months").notNull(),
  // BIGINT minor units of the platform's own billing currency — öre for SEK
  // (plan.md §1.2).
  price: bigint("price", { mode: "number" }).notNull(),
  limits: json("limits").notNull().default({}),
  features: json("features").notNull().default({ factura_electronica: "coming_soon" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: datetime("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    planId: char("plan_id", { length: 26 }).notNull(),
    startsAt: datetime("starts_at").notNull(),
    expiresAt: datetime("expires_at").notNull(),
    status: varchar("status", {
      length: 20,
      enum: ["active", "grace", "expired"],
    })
      .notNull()
      .default("active"),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("subscriptions_tenant_id_idx").on(table.tenantId)],
);

export const payments = mysqlTable(
  "payments",
  {
    id: char("id", { length: 26 }).primaryKey(),
    subscriptionId: char("subscription_id", { length: 26 }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("SEK"),
    method: varchar("method", {
      length: 20,
      enum: ["transfer", "cash", "other"],
    }).notNull(),
    reference: varchar("reference", { length: 200 }),
    recordedBy: char("recorded_by", { length: 26 }).notNull(),
    notes: text("notes"),
    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("payments_subscription_id_idx").on(table.subscriptionId)],
);
