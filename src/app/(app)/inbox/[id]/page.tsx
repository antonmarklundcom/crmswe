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
import { listApprovedTemplates } from "@/modules/whatsapp/templates";
import { listPendingDrafts } from "@/modules/ai/replies";
import { Button } from "@/components/ui/button";
import {
  sendTextAction,
  sendTemplateAction,
  approveAiDraftAction,
  discardAiDraftAction,
  setConversationAiAction,
} from "../actions";

// Window countdown (§6.5). Rendered server-side, so it's accurate as of
// page load rather than ticking — the inbox is a server component and
// there's no polling layer yet (deferred with the rest of §6.5's realtime).
function formatRemaining(lastInboundAt: Date | null): string {
  if (!lastInboundAt) return "";
  const msLeft = lastInboundAt.getTime() + 24 * 60 * 60 * 1000 - Date.now();
  if (msLeft <= 0) return "";
  const hours = Math.floor(msLeft / (60 * 60 * 1000));
  const minutes = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000));
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
}

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

  const [contact, messages, templates, aiDrafts] = await Promise.all([
    getContact(ctx, conversation.contactId),
    listMessagesForConversation(ctx, id),
    listApprovedTemplates(ctx, conversation.waAccountId),
    listPendingDrafts(ctx, id),
  ]);

  if (conversation.unreadCount > 0) {
    await markConversationRead(ctx, id);
  }

  const windowOpen = isWithinFreeFormWindow(conversation.lastInboundAt);
  const sendAction = sendTextAction;
  const aiDisabled = !!conversation.aiDisabledAt;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{contact?.name ?? conversation.contactId}</h1>
      <p className="text-sm text-muted-foreground">{contact?.phone}</p>

      {/* Per-conversation kill switch (§10 1O). Deliberately on the thread
          itself rather than buried in settings: the moment a rep needs it is
          the moment they're reading the conversation going wrong. */}
      <form action={setConversationAiAction} className="flex items-center gap-2 text-sm">
        <input type="hidden" name="conversationId" value={id} />
        <input type="hidden" name="enabled" value={aiDisabled ? "true" : "false"} />
        <span className={aiDisabled ? "text-muted-foreground" : "text-green-700"}>
          {aiDisabled ? t("aiOff") : t("aiOn")}
        </span>
        <Button type="submit" size="sm" variant="outline">
          {aiDisabled ? t("aiEnable") : t("aiDisable")}
        </Button>
      </form>

      {aiDrafts.length > 0 && (
        <section className="flex flex-col gap-2 rounded-md border border-blue-300 bg-blue-50 p-3">
          <h2 className="text-sm font-medium text-blue-900">{t("aiDraftsTitle")}</h2>
          {aiDrafts.map((draft) => (
            <div key={draft.id} className="flex flex-col gap-2 rounded-md bg-white p-3 text-sm">
              <p>{draft.body}</p>
              <p className="text-xs text-muted-foreground">
                {draft.provider} · {draft.model} ·{" "}
                {t("aiTokens", {
                  tokens: draft.promptTokens + draft.completionTokens,
                })}
              </p>
              <div className="flex gap-2">
                {/* Approving is only offered while the window is open —
                    outside it the only legal message is a Meta-approved
                    template, which an LLM cannot author (§6.4, §10 1O). */}
                {windowOpen ? (
                  <form action={approveAiDraftAction}>
                    <input type="hidden" name="replyId" value={draft.id} />
                    <input type="hidden" name="conversationId" value={id} />
                    <Button type="submit" size="sm">
                      {t("aiApprove")}
                    </Button>
                  </form>
                ) : (
                  <span className="text-xs text-amber-800">{t("aiDraftWindowClosed")}</span>
                )}
                <form action={discardAiDraftAction}>
                  <input type="hidden" name="replyId" value={draft.id} />
                  <input type="hidden" name="conversationId" value={id} />
                  <Button type="submit" size="sm" variant="outline">
                    {t("aiDiscard")}
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}

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
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t("windowOpen", { remaining: formatRemaining(conversation.lastInboundAt) })}
          </p>
          <form action={sendAction} className="flex gap-2">
            <input type="hidden" name="conversationId" value={id} />
            <input
              name="body"
              required
              placeholder={t("messagePlaceholder")}
              className="flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <Button type="submit">{t("send")}</Button>
          </form>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <p className="rounded-md border bg-amber-100 px-3 py-2 text-sm text-amber-900">
            {t("windowClosed")}
          </p>
          {templates.length > 0 ? (
            <form action={sendTemplateAction} className="flex gap-2">
              <input type="hidden" name="conversationId" value={id} />
              <select name="template" required className="flex-1 rounded-md border px-3 py-2 text-sm">
                {templates.map((template) => (
                  <option
                    key={template.id}
                    value={`${template.name}|${template.language}`}
                  >
                    {template.name} ({template.language})
                  </option>
                ))}
              </select>
              <Button type="submit">{t("sendTemplate")}</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noTemplates")}</p>
          )}
        </div>
      )}
    </div>
  );
}
