import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { listTenantUsers } from "@/modules/tenancy/users";
import { listInvitations } from "@/modules/tenancy/invitations";
import { env } from "@/lib/config/env";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { InviteForm, type InviteLabels } from "./InviteForm";
import { revokeInvitationAction } from "./actions";

const date = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function UsersPage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.users");

  if (ctx.role !== "admin") {
    return <p className="text-muted-foreground">{t("adminOnly")}</p>;
  }

  const [users, invitations] = await Promise.all([
    listTenantUsers(ctx),
    listInvitations(ctx),
  ]);

  const pending = invitations
    .filter((invitation) => !invitation.acceptedAt && invitation.expiresAt > new Date())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const labels: InviteLabels = {
    email: t("email"),
    role: t("role"),
    roleAdmin: t("roles.admin"),
    roleAgent: t("roles.agent"),
    submit: t("invite"),
    linkTitle: t("linkTitle"),
    linkHelp: t("linkHelp"),
    copy: t("copy"),
    copied: t("copied"),
    errors: {
      invalid: t("errors.invalid"),
      emailTaken: t("errors.emailTaken"),
      readOnly: t("errors.readOnly"),
      unknown: t("errors.unknown"),
    },
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("intro")} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("membersTitle")}</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">{t("name")}</th>
              <th className="py-2">{t("email")}</th>
              <th className="py-2">{t("role")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b">
                <td className="py-2">
                  {user.name}
                  {user.id === ctx.userId && (
                    <span className="ml-2 text-xs text-muted-foreground">({t("you")})</span>
                  )}
                </td>
                <td className="py-2">{user.email}</td>
                <td className="py-2">
                  {user.role === "admin" ? t("roles.admin") : t("roles.agent")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("inviteTitle")}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("inviteHelp")}</p>
        <InviteForm labels={labels} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("pendingTitle")}</h2>
        {pending.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("pendingEmptyTitle")}
            description={t("pendingEmptyBody")}
          />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {pending.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{invitation.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {invitation.role === "admin" ? t("roles.admin") : t("roles.agent")} ·{" "}
                    {t("expiresAt", { date: date.format(invitation.expiresAt) })}
                  </span>
                  <code className="mt-1 max-w-full overflow-x-auto font-mono text-xs text-muted-foreground">
                    {env.APP_URL}/accept-invite/{invitation.token}
                  </code>
                </span>
                <form action={revokeInvitationAction}>
                  <input type="hidden" name="invitationId" value={invitation.id} />
                  <Button type="submit" size="sm" variant="outline">
                    {t("revoke")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
