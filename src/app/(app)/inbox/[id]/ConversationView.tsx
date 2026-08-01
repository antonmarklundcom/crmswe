"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  sendTextAction,
  sendTemplateAction,
  approveAiDraftAction,
  discardAiDraftAction,
  setConversationAiAction,
} from "../actions";

export type ConversationData = {
  contact: { name: string; phone: string } | null;
  conversation: { id: string; lastInboundAt: string | null; aiDisabledAt: string | null };
  messages: Array<{
    id: string;
    direction: "in" | "out";
    body: string | null;
    status: string;
    createdAt: string;
  }>;
  templates: Array<{ id: string; name: string; language: string }>;
  aiDrafts: Array<{
    id: string;
    body: string | null;
    provider: string | null;
    model: string | null;
    promptTokens: number;
    completionTokens: number;
  }>;
  windowOpen: boolean;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatRemaining(lastInboundAt: string | null): string {
  if (!lastInboundAt) return "";
  const msLeft = new Date(lastInboundAt).getTime() + 24 * 60 * 60 * 1000 - Date.now();
  if (msLeft <= 0) return "";
  const hours = Math.floor(msLeft / (60 * 60 * 1000));
  const minutes = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000));
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
}

// Conversation thread, 5s polling (PLAN.md §6.5). The two things that must
// never get clobbered by a poll landing mid-interaction: a half-typed reply
// (kept in its own `replyBody` state, never overwritten by fetched data)
// and scroll position (auto-scroll only fires when the rep was already at
// the bottom before new messages arrived).
export function ConversationView({
  conversationId,
  initial,
}: {
  conversationId: string;
  initial: ConversationData;
}) {
  const t = useTranslations("app.inbox");

  const { data, mutate } = useSWR<ConversationData>(
    `/api/inbox/${conversationId}`,
    fetcher,
    { fallbackData: initial, refreshInterval: 5000 },
  );
  const d = data ?? initial;

  const listRef = useRef<HTMLUListElement>(null);
  const prevCountRef = useRef(d.messages.length);
  const [replyBody, setReplyBody] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (d.messages.length !== prevCountRef.current && (nearBottom || prevCountRef.current === 0)) {
      el.scrollTop = el.scrollHeight;
    }
    prevCountRef.current = d.messages.length;
  }, [d.messages.length]);

  function runAction(run: () => Promise<void>) {
    startTransition(async () => {
      await run();
      await mutate();
    });
  }

  function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = replyBody.trim();
    if (!body) return;
    const fd = new FormData();
    fd.set("conversationId", conversationId);
    fd.set("body", body);
    setReplyBody("");
    runAction(() => sendTextAction(fd));
  }

  function handleSendTemplate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    runAction(() => sendTemplateAction(fd));
  }

  function handleApproveDraft(replyId: string) {
    const fd = new FormData();
    fd.set("replyId", replyId);
    fd.set("conversationId", conversationId);
    runAction(() => approveAiDraftAction(fd));
  }

  function handleDiscardDraft(replyId: string) {
    const fd = new FormData();
    fd.set("replyId", replyId);
    fd.set("conversationId", conversationId);
    runAction(() => discardAiDraftAction(fd));
  }

  function handleToggleAi() {
    const fd = new FormData();
    fd.set("conversationId", conversationId);
    fd.set("enabled", d.conversation.aiDisabledAt ? "true" : "false");
    runAction(() => setConversationAiAction(fd));
  }

  const aiDisabled = !!d.conversation.aiDisabledAt;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{d.contact?.name ?? d.conversation.id}</h1>
      <p className="text-sm text-muted-foreground">{d.contact?.phone}</p>

      <div className="flex items-center gap-2 text-sm">
        <span className={aiDisabled ? "text-muted-foreground" : "text-green-700"}>
          {aiDisabled ? t("aiOff") : t("aiOn")}
        </span>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={handleToggleAi}>
          {aiDisabled ? t("aiEnable") : t("aiDisable")}
        </Button>
      </div>

      {d.aiDrafts.length > 0 && (
        <section className="flex flex-col gap-2 rounded-md border border-blue-300 bg-blue-50 p-3">
          <h2 className="text-sm font-medium text-blue-900">{t("aiDraftsTitle")}</h2>
          {d.aiDrafts.map((draft) => (
            <div key={draft.id} className="flex flex-col gap-2 rounded-md bg-white p-3 text-sm">
              <p>{draft.body}</p>
              <p className="text-xs text-muted-foreground">
                {draft.provider} · {draft.model} ·{" "}
                {t("aiTokens", { tokens: draft.promptTokens + draft.completionTokens })}
              </p>
              <div className="flex gap-2">
                {d.windowOpen ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => handleApproveDraft(draft.id)}
                  >
                    {t("aiApprove")}
                  </Button>
                ) : (
                  <span className="text-xs text-amber-800">{t("aiDraftWindowClosed")}</span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => handleDiscardDraft(draft.id)}
                >
                  {t("aiDiscard")}
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      <ul ref={listRef} className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
        {d.messages.map((message) => (
          <li
            key={message.id}
            className={`max-w-md rounded-md border px-3 py-2 text-sm ${
              message.direction === "out" ? "ml-auto bg-accent" : ""
            }`}
          >
            <p>{message.body}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(message.createdAt).toLocaleString("es-PY")} · {message.status}
            </p>
          </li>
        ))}
        {d.messages.length === 0 && <li className="text-muted-foreground">{t("noMessages")}</li>}
      </ul>

      {d.windowOpen ? (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t("windowOpen", { remaining: formatRemaining(d.conversation.lastInboundAt) })}
          </p>
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              name="body"
              required
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder={t("messagePlaceholder")}
              className="flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={pending}>
              {t("send")}
            </Button>
          </form>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <p className="rounded-md border bg-amber-100 px-3 py-2 text-sm text-amber-900">
            {t("windowClosed")}
          </p>
          {d.templates.length > 0 ? (
            <form onSubmit={handleSendTemplate} className="flex gap-2">
              <input type="hidden" name="conversationId" value={conversationId} />
              <select name="template" required className="flex-1 rounded-md border px-3 py-2 text-sm">
                {d.templates.map((template) => (
                  <option key={template.id} value={`${template.name}|${template.language}`}>
                    {template.name} ({template.language})
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={pending}>
                {t("sendTemplate")}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noTemplates")}</p>
          )}
        </div>
      )}
    </div>
  );
}
