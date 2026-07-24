import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import {
  getConversation,
  listMessagesForConversation,
  markConversationRead,
  isWithinFreeFormWindow,
} from "@/modules/whatsapp/inbox";
import { getContact } from "@/modules/crm/contacts";
import { Button } from "@/components/ui/button";
import { sendTextAction } from "../actions";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.inbox");

  const conversation = await getConversation(ctx, id);
  if (!conversation) notFound();

  const [contact, messages] = await Promise.all([
    getContact(ctx, conversation.contactId),
    listMessagesForConversation(ctx, id),
  ]);

  if (conversation.unreadCount > 0) {
    await markConversationRead(ctx, id);
  }

  const windowOpen = isWithinFreeFormWindow(conversation.lastInboundAt);
  const sendAction = sendTextAction;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{contact?.name ?? conversation.contactId}</h1>
      <p className="text-sm text-muted-foreground">{contact?.phone}</p>

      <ul className="flex flex-col gap-2">
        {messages.map((message) => (
          <li
            key={message.id}
            className={`max-w-md rounded-md border px-3 py-2 text-sm ${
              message.direction === "out" ? "ml-auto bg-accent" : ""
            }`}
          >
            <p>{message.body}</p>
            <p className="text-xs text-muted-foreground">
              {message.createdAt.toLocaleString("es-PY")} · {message.status}
            </p>
          </li>
        ))}
        {messages.length === 0 && <li className="text-muted-foreground">{t("noMessages")}</li>}
      </ul>

      {windowOpen ? (
        <form action={sendAction} className="mt-4 flex gap-2">
          <input type="hidden" name="conversationId" value={id} />
          <input
            name="body"
            required
            placeholder={t("messagePlaceholder")}
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <Button type="submit">{t("send")}</Button>
        </form>
      ) : (
        <p className="mt-4 rounded-md border bg-amber-100 px-3 py-2 text-sm text-amber-900">
          {t("windowClosed")}
        </p>
      )}
    </div>
  );
}
