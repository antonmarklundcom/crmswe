import { createSuperadminUser } from "@/modules/tenancy/users";

// Superadmin bootstrap (PLAN.md §10 1C follow-up #2). Better Auth's public
// /sign-up/email is gated to invited emails only (lib/auth/server.ts), and
// invitations can only be created by an existing tenant admin or superadmin
// — so the very first superadmin can't come through the app at all.
//
// Usage: npx tsx scripts/create-superadmin.ts <email> <password> <name>

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password || !name) {
    console.error("Usage: npx tsx scripts/create-superadmin.ts <email> <password> <name>");
    process.exit(1);
  }

  const user = await createSuperadminUser({ email, password, name });
  console.log(`Superadmin created: ${email} (${user?.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
