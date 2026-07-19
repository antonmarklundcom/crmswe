import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { adminAc } from "better-auth/plugins/admin/access";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/lib/config/env";
import { newId } from "@/lib/ids";
import { hasValidInvitationForEmail } from "@/modules/tenancy/invitations";

// Better Auth instance (Drizzle adapter + admin plugin for impersonation —
// PLAN.md §2.3, §3.2). This file is infra wiring analogous to db/client.ts
// and worker/index.ts, not business logic, so it is one of the few places
// allowed to hold a raw `db` reference (see eslint.config.mjs exemptions).
//
// `users` (schema/tenancy.ts) doubles as Better Auth's `user` table; its
// `tenantId` / `isSuperadmin` columns are declared as additionalFields so
// the adapter reads/writes them. `role`/`banned`/`banReason`/`banExpires` on
// user and `impersonatedBy` on session are contributed automatically by the
// admin plugin's own schema — no need to redeclare them here.
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.APP_URL,
  database: drizzleAdapter(db, {
    provider: "mysql",
    usePlural: true,
    schema,
  }),
  advanced: {
    database: {
      // Every PK is a char(26) ULID (PLAN.md §2.3) — Better Auth defaults to
      // its own longer random IDs, which don't fit the column. Discovered
      // via a smoke test (ER_DATA_TOO_LONG on user creation), not caught by
      // typecheck/lint since the mismatch is only a runtime string length.
      generateId: () => newId(),
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      tenantId: {
        type: "string",
        required: false,
        input: false,
      },
      isSuperadmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  hooks: {
    // Closes the open public sign-up (PLAN.md §10 1C follow-up #2): Better
    // Auth's /sign-up/email is otherwise unauthenticated and unrestricted —
    // anyone could create an orphan account, and squatting an invited
    // email would permanently block that invitation from being accepted.
    // Restrict it to emails holding a valid, unexpired, unaccepted
    // invitation. The accept-invite flow (modules/auth/invitations.ts)
    // validates the same invitation immediately before calling
    // auth.api.signUpEmail, so it always passes this check too.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const email = (ctx.body as { email?: string } | undefined)?.email;
      if (!email || !(await hasValidInvitationForEmail(email))) {
        throw new APIError("FORBIDDEN", {
          message: "Este correo no tiene una invitación válida.",
        });
      }
    }),
  },
  plugins: [
    admin({
      // Only users whose stored role is literally "superadmin" can reach
      // Better Auth's own /api/auth/admin/* endpoints (impersonate, ban,
      // list users, etc). Tenant roles are "admin"/"agent" and never match
      // this, so a tenant admin cannot escalate through the admin plugin's
      // HTTP surface. The app's own authorization (getSuperadminContext,
      // src/modules/tenancy/context.ts) additionally requires
      // `isSuperadmin === true` and never trusts `role` alone.
      adminRoles: ["superadmin"],
      // "superadmin" isn't one of the plugin's built-in roles (admin|user),
      // so it must be declared with an access-control role — reuse the
      // plugin's own full-permission `adminAc` rather than redefining the
      // statement set (§3.2 gives superadmins the same admin-plugin powers
      // as its default "admin" role, just under our own role name to avoid
      // colliding with tenant `role="admin"` — see adminRoles comment above).
      roles: { superadmin: adminAc },
      defaultRole: "agent",
      impersonationSessionDuration: 60 * 60,
    }),
  ],
});
