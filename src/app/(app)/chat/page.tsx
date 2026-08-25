import { MessageCircle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/i18n/format";
import { env } from "@/lib/config/env";
import { requireTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";
import { listSites } from "@/modules/sites/sites";
import { listChatWidgets } from "@/modules/chatwidget/widgets";
import {
  listConversations,
  listMessages,
  markConversationRead,
} from "@/modules/chatwidget/conversations";
import { getContact } from "@/modules/crm/contacts";
import { listPendingChatDrafts } from "@/modules/chatwidget/drafts";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ChatReplyForm, EditWidgetForm, NewWidgetForm } from "./ChatForms";
import {
  approveDraftAction,
  closeChatAction,
  discardDraftAction,
  rotateWidgetKeyAction,
  toggleChatAiAction,
} from "./actions";

// The website chat surface (docs/SPEC-CHAT-WIDGET.md §5). Deliberately its
// own page rather than a tab inside /inbox: the WhatsApp inbox carries its
// own assignment and 24h-window rules, and a unified inbox deserves to be a
// decision rather than a side effect.

export default async function ChatPage() {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.chat");
  const locale = await getLocale();

  const [tenant, conversations] = await Promise.all([
    getTenant(ctx.tenantId),
    listConversations(ctx, { status: "open" }),
  ]);
  const settings = (tenant?.settings ?? {}) as TenantSettings;
  const tenantOnDraft = settings.ai?.mode !== "send";

  const isAdmin = ctx.role === "admin";
  const [sites, widgets] = isAdmin
    ? await Promise.all([listSites(ctx), listChatWidgets(ctx)])
    : [[], []];

  const widgetLabels = {
    site: t("settingsTitle"),
    name: t("widgetName"),
    greeting: t("greeting"),
    color: t("color"),
    systemPrompt: t("systemPrompt"),
    systemPromptHelp: t("systemPromptHelp"),
    neverPromise: t("neverPromise"),
    mode: t("mode"),
    modeOff: t("modeOff"),
    modeDraft: t("modeDraft"),
    modeSend: t("modeSend"),
    modeCeiling: t("modeCeiling"),
    askForPhone: t("askForPhone"),
    captureAfter: t("captureAfter"),
    createDeal: t("createDeal"),
    allowedOrigins: t("allowedOrigins"),
    allowedOriginsHelp: t("allowedOriginsHelp"),
    maxPerConversation: t("maxPerConversation"),
    capsShared: t("capsShared"),
    save: t("save"),
    create: t("createWidget"),
    errors: {
      nameRequired: t("errors.nameRequired"),
      siteRequired: t("errors.siteRequired"),
      exists: t("errors.exists"),
    },
  };

  const siteOptions = sites.map((site) => ({ id: site.id, name: site.name }));
  const unconfigured = siteOptions.filter(
    (site) => !widgets.some((widget) => widget.siteId === site.id),
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("intro")} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t("conversationTitle")}</h2>
        {conversations.length === 0 ? (
          <EmptyState icon={MessageCircle} title={t("title")} description={t("empty")} />
        ) : (
          <ul className="flex flex-col gap-4">
            {await Promise.all(
              conversations.map(async (conversation) => {
                const [messages, drafts, contact] = await Promise.all([
                  listMessages(ctx, conversation.id),
                  listPendingChatDrafts(ctx, conversation.id),
                  conversation.contactId
                    ? getContact(ctx, conversation.contactId)
                    : Promise.resolve(null),
                ]);

                // This page *is* the thread view — it renders the whole
                // transcript — so showing it is what "the rep opened it"
                // means here, exactly as /inbox/[id] does for WhatsApp. The
                // badge below still shows what was unread on this load,
                // because the row was read before it was cleared.
                if (conversation.unreadCount > 0) {
                  await markConversationRead(ctx, conversation.id);
                }

                return (
                  <li key={conversation.id} className="flex flex-col gap-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {contact ? (
                          <a className="underline" href={`/contacts/${contact.id}`}>
                            {contact.name}
                          </a>
                        ) : (
                          t("unknownVisitor")
                        )}
                      </p>
                      <span className="flex items-center gap-3 text-xs">
                        {conversation.unreadCount > 0 ? (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">
                            {t("unread", { count: conversation.unreadCount })}
                          </span>
                        ) : null}
                        <span className="text-muted-foreground">
                          {conversation.lastMessageAt
                            ? formatDateTime(conversation.lastMessageAt, locale, tenant?.timezone)
                            : ""}
                        </span>
                        <form
                          action={toggleChatAiAction.bind(
                            null,
                            conversation.id,
                            conversation.aiDisabledAt === null,
                          )}
                        >
                          <button type="submit" className="underline">
                            {conversation.aiDisabledAt ? t("resumeAi") : t("silenceAi")}
                          </button>
                        </form>
                        <form action={closeChatAction.bind(null, conversation.id)}>
                          <button type="submit" className="underline">
                            {t("close")}
                          </button>
                        </form>
                      </span>
                    </div>

                    <ul className="flex flex-col gap-1 text-sm">
                      {messages.map((message) => (
                        <li
                          key={message.id}
                          className={
                            message.direction === "in"
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          <span className="font-mono text-xs">{message.author}</span>{" "}
                          {message.body}
                        </li>
                      ))}
                    </ul>

                    {drafts.map((draft) => (
                      <div
                        key={draft.id}
                        className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-sm"
                      >
                        <p className="text-xs text-muted-foreground">{t("pendingDraft")}</p>
                        <p>{draft.body}</p>
                        <span className="flex gap-3 text-xs">
                          <form action={approveDraftAction.bind(null, draft.id)}>
                            <button type="submit" className="underline">
                              {t("approveDraft")}
                            </button>
                          </form>
                          <form action={discardDraftAction.bind(null, draft.id)}>
                            <button type="submit" className="underline">
                              {t("discardDraft")}
                            </button>
                          </form>
                        </span>
                      </div>
                    ))}

                    <ChatReplyForm
                      conversationId={conversation.id}
                      label={t("reply")}
                      placeholder={t("reply")}
                    />
                  </li>
                );
              }),
            )}
          </ul>
        )}
      </section>

      {isAdmin ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-medium">{t("settingsTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("settingsIntro")}</p>
          </div>

          {siteOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSites")}</p>
          ) : null}

          {widgets.map((widget) => (
            <div key={widget.id} className="flex flex-col gap-3 rounded-lg border p-4">
              <p className="font-medium">{widget.name}</p>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">{t("embedTitle")}</p>
                <code className="block overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">
                  {`<script src="${env.APP_URL}/w.js" data-widget="${widget.widgetKey}" defer></script>`}
                </code>
                <p className="text-xs text-muted-foreground">{t("embedHelp")}</p>
                <form action={rotateWidgetKeyAction.bind(null, widget.id)}>
                  <button type="submit" className="text-xs underline">
                    {t("rotateKey")}
                  </button>
                </form>
                <p className="text-xs text-muted-foreground">{t("rotateHelp")}</p>
              </div>

              <EditWidgetForm
                widgetId={widget.id}
                labels={widgetLabels}
                sites={siteOptions}
                tenantOnDraft={tenantOnDraft}
                values={{
                  siteId: widget.siteId,
                  name: widget.name,
                  mode: widget.mode,
                  greeting: widget.greeting ?? "",
                  primaryColor: widget.primaryColor ?? "",
                  systemPrompt: widget.systemPrompt ?? "",
                  neverPromise: widget.neverPromise ?? "",
                  askForPhone: widget.askForPhone,
                  captureAfterMessages: widget.captureAfterMessages,
                  createDeal: widget.createDeal,
                  maxRepliesPerConversationPerDay: widget.maxRepliesPerConversationPerDay,
                  allowedOrigins: (widget.allowedOrigins as string[] | null) ?? [],
                }}
              />
            </div>
          ))}

          {unconfigured.length > 0 ? (
            <NewWidgetForm
              labels={widgetLabels}
              sites={unconfigured}
              tenantOnDraft={tenantOnDraft}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
