import { AcceptInviteForm } from "./AcceptInviteForm";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <AcceptInviteForm token={token} />
    </main>
  );
}
