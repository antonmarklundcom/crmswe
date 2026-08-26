"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { TURNSTILE_RESPONSE_FIELD } from "@/lib/turnstile";

// The chat itself, inside the iframe (docs/SPEC-CHAT-WIDGET.md §1.2).
//
// Every fetch below is same-origin — the iframe is served from the CRM — so
// there is no CORS surface and no credential in anyone's page source.

type Labels = {
  placeholder: string;
  send: string;
  close: string;
  pendingHuman: string;
  askContactTitle: string;
  name: string;
  phone: string;
  sendContact: string;
  captured: string;
  error: string;
  rateLimited: string;
  offline: string;
};

type Message = { id: string; author: string; body: string; at: string };

const VISITOR_KEY = "vc_chat_visitor";
const POLL_MS = 8000;

/**
 * A per-visitor id, minted here and kept in the iframe's own storage. It is a
 * conversation handle, not a credential — it grants nothing that the public
 * widget key doesn't already, and the server never trusts it for anything but
 * "which open conversation is this".
 */
function visitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const minted = crypto.randomUUID().replace(/-/g, "").slice(0, 26).toUpperCase();
    window.localStorage.setItem(VISITOR_KEY, minted);
    return minted;
  } catch {
    // Private windows and blocked storage are not a reason to have no chat —
    // the visitor just gets a fresh thread each load.
    return crypto.randomUUID().replace(/-/g, "").slice(0, 26).toUpperCase();
  }
}

export function ChatWindow({
  widgetKey,
  title,
  avatarUrl,
  primaryColor,
  greeting,
  askForPhone,
  parentOrigin,
  turnstileSiteKey,
  labels,
}: {
  widgetKey: string;
  title: string;
  avatarUrl: string | null;
  primaryColor: string | null;
  greeting: string;
  askForPhone: boolean;
  /** Origin of the page that embedded this iframe, from the document
   * request's `Referer`. Null when the host page suppressed it. */
  parentOrigin: string | null;
  /** Rendered before the first message only, and only when the widget's site
   * has Turnstile configured — the server requires a token before the first
   * provider call of a conversation and skips the check otherwise. */
  turnstileSiteKey: string | null;
  labels: Labels;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingHuman, setPendingHuman] = useState(false);
  const [askContact, setAskContact] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [page, setPage] = useState<{ url?: string; referrer?: string }>({});
  const visitor = useRef<string>("");
  const scroller = useRef<HTMLDivElement>(null);

  if (!visitor.current) visitor.current = visitorId();

  const accent = primaryColor || "#111827";

  useEffect(() => {
    // w.js forwards the *host* page's URL and referrer: the iframe cannot see
    // them itself, and they are what attribution is built from.
    //
    // Only the page that actually embedded us may say so. `parentOrigin` is
    // the server's reading of this document's own `Referer`, which is that
    // page by definition; with no `Referer` we trust nothing but our own
    // origin. The `source` check is the second half — a same-origin popup or
    // a nested frame is not our parent either. Without both, any page that
    // framed us could rewrite the attribution on someone's lead.
    const expected = parentOrigin ?? window.location.origin;
    function onMessage(event: MessageEvent) {
      if (event.origin !== expected) return;
      if (event.source !== window.parent) return;
      if (event.data?.type === "vc-chat:page") {
        setPage({ url: event.data.url, referrer: event.data.referrer });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [parentOrigin]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, askContact]);

  const poll = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/v1/chat/${encodeURIComponent(widgetKey)}/poll?visitorId=${visitor.current}`,
      );
      if (!response.ok) return;
      const body = (await response.json()) as { messages: Message[] };
      // Only replace when something actually arrived, so a poll never wipes
      // an optimistic message mid-send.
      if (body.messages.length > 0) setMessages(body.messages);
    } catch {
      /* a failed poll is not worth telling the visitor about */
    }
  }, [widgetKey]);

  useEffect(() => {
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    // Turnstile's implicit rendering injects its hidden input into the
    // containing form, so the token comes out with the rest of it.
    const token = String(
      new FormData(event.currentTarget).get(TURNSTILE_RESPONSE_FIELD) ?? "",
    );

    setSending(true);
    setError(null);
    setDraft("");

    try {
      const response = await fetch(`/api/v1/chat/${encodeURIComponent(widgetKey)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          visitorId: visitor.current,
          body,
          pageUrl: page.url,
          referrer: page.referrer,
          locale: navigator.language,
          turnstileToken: token || undefined,
        }),
      });

      if (!response.ok) {
        setError(response.status === 429 ? labels.rateLimited : labels.error);
        return;
      }

      const data = (await response.json()) as {
        messages: Message[];
        askForContact: boolean;
        pendingHuman: boolean;
      };
      setMessages(data.messages);
      setPendingHuman(data.pendingHuman);
      if (data.askForContact && askForPhone && !captured) setAskContact(true);
    } catch {
      setError(labels.error);
    } finally {
      setSending(false);
    }
  }

  async function capture(formData: FormData) {
    setError(null);
    try {
      const response = await fetch(`/api/v1/chat/${encodeURIComponent(widgetKey)}/capture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          visitorId: visitor.current,
          name: formData.get("name") || undefined,
          phone: formData.get("phone"),
        }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? labels.rateLimited : labels.error);
        return;
      }
      setCaptured(true);
      setAskContact(false);
    } catch {
      setError(labels.error);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-white text-sm text-neutral-900">
      <header
        className="flex items-center justify-between gap-2 px-4 py-3 text-white"
        style={{ backgroundColor: accent }}
      >
        <span className="flex items-center gap-2 font-medium">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-supplied external URL, no loader configured
            <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : null}
          {title}
        </span>
        <button
          type="button"
          aria-label={labels.close}
          className="cursor-pointer text-lg leading-none"
          onClick={() =>
            window.parent.postMessage(
              { type: "vc-chat:close" },
              parentOrigin ?? window.location.origin,
            )
          }
        >
          ×
        </button>
      </header>

      <div ref={scroller} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        <p className="max-w-[85%] self-start rounded-2xl bg-neutral-100 px-3 py-2">{greeting}</p>

        {messages.map((message) => (
          <p
            key={message.id}
            className={
              message.author === "visitor"
                ? "max-w-[85%] self-end rounded-2xl px-3 py-2 text-white"
                : "max-w-[85%] self-start rounded-2xl bg-neutral-100 px-3 py-2"
            }
            style={message.author === "visitor" ? { backgroundColor: accent } : undefined}
          >
            {message.body}
          </p>
        ))}

        {/* Draft mode, a tripped cap and a provider error all read the same
            to the visitor: a person is coming. The tenant's billing state is
            never their customer's business. */}
        {pendingHuman && !captured ? (
          <p className="self-start text-xs text-neutral-500">{labels.pendingHuman}</p>
        ) : null}

        {captured ? (
          <p className="self-start text-xs text-neutral-500">{labels.captured}</p>
        ) : null}

        {askContact ? (
          <form action={capture} className="flex flex-col gap-2 rounded-xl border p-3">
            <p className="font-medium">{labels.askContactTitle}</p>
            <input
              name="name"
              placeholder={labels.name}
              className="rounded-md border px-2 py-1"
              autoComplete="name"
            />
            <input
              name="phone"
              type="tel"
              placeholder={labels.phone}
              className="rounded-md border px-2 py-1"
              autoComplete="tel"
            />
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-white"
              style={{ backgroundColor: accent }}
            >
              {labels.sendContact}
            </button>
          </form>
        ) : null}

        {error ? <p className="self-start text-xs text-red-600">{error}</p> : null}
      </div>

      <form onSubmit={send} className="flex flex-col gap-2 border-t p-3">
        {/* Only before the first message: the server asks for a token once
            per conversation, and a visitor mid-chat has already paid it. */}
        {turnstileSiteKey && messages.length === 0 ? (
          <>
            <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              async
              defer
              strategy="afterInteractive"
            />
          </>
        ) : null}

        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={labels.placeholder}
            className="flex-1 rounded-md border px-3 py-2"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-md px-3 py-2 text-white disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {labels.send}
          </button>
        </div>
      </form>
    </div>
  );
}
