import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { getInvitationByToken } from "@/modules/tenancy/invitations";
import { getUserByEmail } from "@/modules/tenancy/users";
import { AcceptInviteForm } from "./AcceptInviteForm";
import { JoinBusinessPanel } from "./JoinBusinessPanel";

// One link, two doors (PLAN.md §3.1, reopened). Which one the invitee gets
// depends on whether the invited address already has an account:
//
//  - no account  → sign up and land in the business (the original flow);
//  - an account  → sign in as themselves and gain a membership alongside the
//                  businesses they already work in.
//
// The branch is decided on the server. Neither door is a way to set a
// password for an address you merely hold a link to.
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invitation = await getInvitationByToken(token);
  const existing = invitation ? await getUserByEmail(invitation.email) : null;

  let body = <AcceptInviteForm token={token} />;
  if (invitation && existing) {
    const session = await auth.api.getSession({ headers: await headers() });
    body = (
      <JoinBusinessPanel
        token={token}
        email={invitation.email}
        signedInAs={session?.user.email ?? null}
      />
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      {body}
    </main>
  );
}
