import { MessageCircle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/i18n/format";
import { env } from "@/lib/config/env";
import { requireTenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";
import { listSites } from "@/modules/sites/sites";
import { listPipelines, listStagesForPipeline } from "@/modules/crm/pipelines";
import { listTags } from "@/modules/crm/contacts";
import { listTenantUsers } from "@/modules/tenancy/users";
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
import {
  AssignChatSelect,
  ChatReplyForm,
  EditWidgetForm,
  NewWidgetForm,
  type WidgetOptions,
} from "./ChatForms";
import {
  approveDraftAction,
  closeChatAction,
  discardDraftAction,
  reopenChatAction,
  rotateWidgetKeyAction,
  toggleChatAiAction,
} from "./actions";

// The website chat surface (docs/SPEC-CHAT-WIDGET.md §5). Deliberately its
// own page rather than a tab inside /inbox: the WhatsApp inbox carries its
// own assignment and 24h-window rules, and a unified inbox deserves to be a
// decision rather than a side effect.

const STATUSES = ["open", "closed", "all"] as const;
type StatusFilter = (typeof STATUSES)[number];

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.chat");
  const locale = await getLocale();

  // Open only was the whole list until now, and closing was one-way: a thread
  // a rep closed left the page and there was no way back to its transcript.
  const requested = (await searchParams).status;
  const status: StatusFilter = STATUSES.includes(requested as StatusFilter)
    ? (requested as StatusFilter)
    : "open";

  const [tenant, conversations, members] = await Promise.all([
    getTenant(ctx.tenantId),
    listConversations(ctx, status === "all" ? {} : { status }),
    listTenantUsers(ctx),
  ]);
  const assignableUsers = members.map((member) => ({
    id: member.id,
    name: member.name || member.email,
  }));
  const settings = (tenant?.settings ?? {}) as TenantSettings;
  const tenantOnDraft = settings.ai?.mode !== "send";

  const isAdmin = ctx.role === "admin";
  const [sites, widgets, pipelines, tags] = isAdmin
    ? await Promise.all([listSites(ctx), listChatWidgets(ctx), listPipelines(ctx), listTags(ctx)])
    : [[], [], [], []];

  const stageLists = await Promise.all(
    pipelines.map(
      async (pipeline) => [pipeline.id, await listStagesForPipeline(ctx, pipeline.id)] as const,
    ),
  );
  const stagesByPipeline = Object.fromEntries(
    stageLists.map(([pipelineId, stages]) => [
      pipelineId,
      stages.map((stage) => ({ id: stage.id, name: stage.name })),
    ]),
  );

  const siteOptions = sites.map((site) => ({ id: site.id, name: site.name }));
  const unconfigured = siteOptions.filter(
    (site) => !widgets.some((widget) => widget.siteId === site.id),
  );

  const widgetOptions: Omit<WidgetOptions, "sites"> = {
    pipelines: pipelines.map((pipeline) => ({ id: pipeline.id, name: pipeline.name })),
    stagesByPipeline,
    users: assignableUsers,
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
    tenantOnDraft,
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("intro")} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{t("conversationTitle")}</h2>
          <nav className="flex gap-2 text-xs">
            {STATUSES.map((option) => (
              <a
                key={option}
                href={`/chat?status=${option}`}
                className={`rounded-md border px-2 py-1 ${
                  option === status ? "border-primary bg-accent" : ""
                }`}
              >
                {t(`filter.${option}` as "filter.open")}
              </a>
            ))}
          </nav>
        </div>
        {conversations.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title={t("title")}
            description={status === "open" ? t("empty") : t("emptyFiltered")}
          />
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
                        {conversation.status === "open" ? (
                          <form action={closeChatAction.bind(null, conversation.id)}>
                            <button type="submit" className="underline">
                              {t("close")}
                            </button>
                          </form>
                        ) : (
                          <form action={reopenChatAction.bind(null, conversation.id)}>
                            <button type="submit" className="underline">
                              {t("reopen")}
                            </button>
                          </form>
                        )}
                      </span>
                    </div>

                    <AssignChatSelect
                      conversationId={conversation.id}
                      users={assignableUsers}
                      assignedUserId={conversation.assignedUserId}
                      labels={{
                        assigned: t("assignedTo"),
                        unassigned: t("assignUnassigned"),
                        failed: t("assignFailed"),
                      }}
                    />

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

                    {/* A closed thread is a transcript, not a conversation:
                        reopen it first rather than answering into it. */}
                    {conversation.status === "open" ? (
                      <ChatReplyForm
                        conversationId={conversation.id}
                        label={t("reply")}
                        placeholder={t("reply")}
                      />
                    ) : null}
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
                {/* w.js reads the launcher's side, colour and label off its
                    own script tag — it draws the bubble before the iframe
                    exists — so what is configured above has to be written
                    into the snippet the tenant pastes. */}
                <code className="block overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">
                  {[
                    `<script src="${env.APP_URL}/w.js"`,
                    `data-widget="${widget.widgetKey}"`,
                    `data-position="${widget.position}"`,
                    ...(widget.primaryColor ? [`data-color="${widget.primaryColor}"`] : []),
                    ...(widget.launcherLabel ? [`data-label="${widget.launcherLabel}"`] : []),
                    "defer></script>",
                  ].join(" ")}
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
                options={{ ...widgetOptions, sites: siteOptions }}
                values={{
                  siteId: widget.siteId,
                  name: widget.name,
                  mode: widget.mode,
                  isActive: widget.isActive,
                  greeting: widget.greeting ?? "",
                  primaryColor: widget.primaryColor ?? "",
                  avatarUrl: widget.avatarUrl ?? "",
                  launcherLabel: widget.launcherLabel ?? "",
                  position: widget.position,
                  offlineMessage: widget.offlineMessage ?? "",
                  systemPrompt: widget.systemPrompt ?? "",
                  neverPromise: widget.neverPromise ?? "",
                  askForPhone: widget.askForPhone,
                  captureAfterMessages: widget.captureAfterMessages,
                  businessHoursMode: widget.businessHoursMode,
                  createDeal: widget.createDeal,
                  defaultPipelineId: widget.defaultPipelineId ?? "",
                  defaultStageId: widget.defaultStageId ?? "",
                  defaultOwnerUserId: widget.defaultOwnerUserId ?? "",
                  defaultTagIds: (widget.defaultTagIds as string[] | null) ?? [],
                  maxRepliesPerConversationPerDay: widget.maxRepliesPerConversationPerDay,
                  allowedOrigins: (widget.allowedOrigins as string[] | null) ?? [],
                }}
              />
            </div>
          ))}

          {unconfigured.length > 0 ? (
            <NewWidgetForm options={{ ...widgetOptions, sites: unconfigured }} />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
