import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

// Browser-side Better Auth client (login forms, impersonation trigger
// button). Talks to /api/auth/* only — never touches the database.
export const authClient = createAuthClient({
  plugins: [adminClient()],
});
