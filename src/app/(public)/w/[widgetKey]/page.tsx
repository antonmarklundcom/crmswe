import { notFound } from "next/navigation";
import { resolveWidget } from "@/modules/chatwidget/public";
import { getTranslator } from "@/lib/i18n/translator";
import { ChatWindow } from "./window";

// The iframe document (docs/SPEC-CHAT-WIDGET.md §1.2). Served from the CRM's
// own origin and embedded by w.js, so every request the chat makes below is
// same-origin — which is what lets this exist without a CORS surface.
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
  const locale = tenant.locale ?? "es";
  const t = await getTranslator(locale, "public.chat");

  return (
    <ChatWindow
      widgetKey={widget.widgetKey}
      title={widget.name || tenant.name}
      avatarUrl={widget.avatarUrl}
      primaryColor={widget.primaryColor}
      greeting={widget.greeting || t("greetingFallback")}
      askForPhone={widget.askForPhone}
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
