import Link from "next/link";
import { MessagesSquare, Smartphone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { listConversations } from "@/modules/whatsapp/inbox";
import { listAccountsForTenant } from "@/modules/whatsapp/accounts";
import { getContact } from "@/modules/crm/contacts";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default async function InboxPage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.inbox");

  const [conversations, accounts] = await Promise.all([
    listConversations(ctx),
    listAccountsForTenant(ctx),
  ]);
  const withContacts = await Promise.all(
    conversations.map(async (conversation) => ({
      conversation,
      contact: await getContact(ctx, conversation.contactId),
    })),
  );

  // An empty inbox has two very different causes: no number connected yet
  // (nothing can arrive) versus connected but quiet. Only the first one has
  // something for the user to do — and only an admin can do it (§3.2).
  const needsAccount = accounts.length === 0;
  const canConnect = ctx.role === "admin";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("intro")} />

      {withContacts.length === 0 ? (
        needsAccount ? (
          <EmptyState
            icon={Smartphone}
            title={t("emptyNoAccountTitle")}
            description={t("emptyNoAccountBody")}
            actionLabel={canConnect ? t("emptyAction") : undefined}
            actionHref={canConnect ? "/whatsapp" : undefined}
          />
        ) : (
          <EmptyState
            icon={MessagesSquare}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        )
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {withContacts.map(({ conversation, contact }) => (
            <li key={conversation.id}>
              <Link
                href={`/inbox/${conversation.id}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-accent"
              >
                <span>
                  <span className="font-medium">{contact?.name ?? conversation.contactId}</span>{" "}
                  <span className="text-muted-foreground">{contact?.phone}</span>
                </span>
                {conversation.unreadCount > 0 && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    {conversation.unreadCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
