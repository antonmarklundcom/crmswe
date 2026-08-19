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
import {
  revokeInvitationAction,
  sendPasswordResetAction,
  setUserActiveAction,
  setUserRoleAction,
} from "./actions";
import { formatDate } from "@/lib/i18n/format";
import { getLocale } from "next-intl/server";
import { Select } from "@/components/ui/form-fields";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.users");
  const locale = await getLocale();
  const tc = await getTranslations("common");

  if (ctx.role !== "admin") {
    return <p className="text-muted-foreground">{t("adminOnly")}</p>;
  }

  const [users, invitations] = await Promise.all([
    listTenantUsers(ctx),
    listInvitations(ctx),
  ]);

  const activeAdmins = users.filter((user) => user.role === "admin" && !user.banned).length;

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
      planLimit: t("errors.planLimit"),
      unknown: t("errors.unknown"),
    },
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("intro")} />

      {aviso === "reset" && (
        <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
          {t("resetSent")}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("membersTitle")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">{t("name")}</th>
                <th className="py-2">{t("email")}</th>
                <th className="py-2">{t("role")}</th>
                <th className="py-2">{t("stateColumn")}</th>
                <th className="py-2 text-right">{t("actionsColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === ctx.userId;
                // Demoting the last active admin would leave the tenant with
                // nobody able to manage it — only a superadmin could undo
                // that, so the option isn't offered. setTenantUserRole
                // refuses it server-side regardless.
                const wouldOrphanTenant =
                  user.role === "admin" && !user.banned && activeAdmins <= 1;

                return (
                  <tr key={user.id} className="border-b align-top">
                    <td className="py-2">
                      {user.name}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">({t("you")})</span>
                      )}
                    </td>
                    <td className="py-2">{user.email}</td>
                    <td className="py-2">
                      {isSelf || wouldOrphanTenant ? (
                        user.role === "admin" ? t("roles.admin") : t("roles.agent")
                      ) : (
                        <form action={setUserRoleAction} className="flex items-center gap-2">
                          <input type="hidden" name="userId" value={user.id} />
                          <Select
                            name="role"
                            defaultValue={user.role ?? "agent"}
                            aria-label={t("role")}
                          >
                            <option value="admin">{t("roles.admin")}</option>
                            <option value="agent">{t("roles.agent")}</option>
                          </Select>
                          <Button type="submit" size="sm" variant="outline">
                            {tc("save")}
                          </Button>
                        </form>
                      )}
                    </td>
                    <td className="py-2">
                      {user.banned ? (
                        <span className="text-muted-foreground">{t("stateInactive")}</span>
                      ) : (
                        <span className="text-green-700">{t("stateActive")}</span>
                      )}
                    </td>
                    <td className="py-2">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-2">
                          <form action={setUserActiveAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input
                              type="hidden"
                              name="active"
                              value={user.banned ? "true" : "false"}
                            />
                            <Button type="submit" size="sm" variant="outline">
                              {user.banned ? t("reactivate") : t("deactivate")}
                            </Button>
                          </form>
                          <form action={sendPasswordResetAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <Button type="submit" size="sm" variant="outline">
                              {t("sendReset")}
                            </Button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
                    {t("expiresAt", { date: formatDate(invitation.expiresAt, locale) })}
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
