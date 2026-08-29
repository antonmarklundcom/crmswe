import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  embedRefererAllowed,
  resolveWidget,
  widgetTurnstileSiteKey,
} from "@/modules/chatwidget/public";
import { getTranslator } from "@/lib/i18n/translator";
import { ChatWindow } from "./window";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

// The iframe document (docs/SPEC-CHAT-WIDGET.md §1.2). Served from the CRM's
// own origin and embedded by w.js, so every request the chat makes below is
// same-origin — which is what lets this exist without a CORS surface.
//
// This is also the **one** request that knows which page is embedding the
// widget — its `Referer` is the host page — so it is where the tenant's
// origin allowlist is enforced (§1.2). A page that is not on the list gets a
// 404: a widget that may not be embedded here does not exist here. Absent
// `Referer` with a non-empty list is the same refusal. The chat's own API
// calls below are same-origin from this iframe and carry nothing about the
// host page, so they assert same-origin instead of re-checking a list they
// cannot see.
//
// The tenant's language, not the visitor's browser: this is the tenant's
// artifact shown to their customer, the same rule the public quote page and
// the booking page follow (§13 H5 #4).

export default async function ChatWidgetFrame({
  params,
}: {
  params: Promise<{ widgetKey: string }>;
}) {
  const { widgetKey } = await params;
  const resolved = await resolveWidget(widgetKey);
  if (!resolved) notFound();

  const { widget, tenant } = resolved;

  const referer = (await headers()).get("referer");
  if (!embedRefererAllowed(widget, referer)) notFound();
  const locale = tenant.locale ?? DEFAULT_LOCALE;
  const t = await getTranslator(locale, "public.chat");

  return (
    <ChatWindow
      widgetKey={widget.widgetKey}
      title={widget.name || tenant.name}
      avatarUrl={widget.avatarUrl}
      primaryColor={widget.primaryColor}
      greeting={widget.greeting || t("greetingFallback")}
      askForPhone={widget.askForPhone}
      parentOrigin={parentOriginOf(referer)}
      turnstileSiteKey={await widgetTurnstileSiteKey(resolved)}
      labels={{
        placeholder: t("placeholder"),
        send: t("send"),
        close: t("close"),
        pendingHuman: t("pendingHuman"),
        askContactTitle: t("askContactTitle"),
        name: t("name"),
        phone: t("phone"),
        sendContact: t("sendContact"),
        captured: t("captured"),
        error: t("error"),
        rateLimited: t("rateLimited"),
        offline: widget.offlineMessage || t("offline"),
      }}
    />
  );
}

/**
 * The origin that loaded this iframe, handed to the client so its `message`
 * listener can refuse anything that is not the embedding page. Null when the
 * host page suppressed its `Referer`; the listener then accepts nothing but
 * our own origin, which costs the host page's URL in attribution and is the
 * right way round.
 */
function parentOriginOf(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
