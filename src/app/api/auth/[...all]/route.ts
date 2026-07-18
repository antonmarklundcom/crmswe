import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/server";

// Better Auth's catch-all route handler — mounts sign-in/sign-up/session and
// the admin plugin's impersonation/ban/list-users endpoints under
// /api/auth/*. Authorization for the admin endpoints is enforced by the
// plugin's `adminRoles` gate (src/lib/auth/server.ts); superadmin-console
// server actions additionally verify getSuperadminContext() before calling
// them (defense in depth, PLAN.md §3.3).
export const { GET, POST } = toNextJsHandler(auth);
