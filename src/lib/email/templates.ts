import { GRACE_PERIOD_DAYS } from "@/modules/tenancy/subscriptions";
import { getTranslator } from "@/lib/i18n/translator";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { formatDate, formatMoney } from "@/lib/i18n/format";
import { siteConfig } from "@/lib/site-config";

// Minimal inline-styled HTML — no build step, no MJML, and email clients
// strip most CSS anyway. Kept deliberately plain (one accent color, system
// font stack) rather than matching per-tenant branding: these are platform
// and account-security emails (invite, reset, expiry), not customer-facing
// documents like the quote PDF, which already carries tenant branding.
//
// The copy lives in the messages files like everything else (PLAN.md §13 H5
// #4); only the markup lives here. The one brand string — the footer — reads
// `siteConfig.name` rather than a literal, per plan.md §1.14: these mails now
// reach a Swedish tenant's *customers*, so the brand on them has to move when
// S1 fills in the real one, and a one-file edit is the whole point of that
// rule (KNOWN-ISSUES O1-5). Every template takes the recipient's
// locale, which callers resolve from the tenant (or the user, where one is
// already known) — never from whoever happened to trigger the send.

type Email = { subject: string; html: string };

function layout(bodyHtml: string, locale: string): string {
  return `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      ${bodyHtml}
      <p style="margin-top:32px;font-size:12px;color:#71717a;">${siteConfig.name}</p>
    </div>
  </body>
</html>`;
}

function heading(text: string): string {
  return `<h1 style="font-size:18px;margin:0 0 8px;">${text}</h1>`;
}

function paragraph(html: string): string {
  return `<p style="font-size:14px;line-height:1.5;color:#3f3f46;">${html}</p>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:16px;padding:12px 20px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${label}</a>`;
}

export async function invitationEmail(input: {
  tenantName: string;
  inviterName: string;
  acceptUrl: string;
  locale?: string | null;
}): Promise<Email> {
  const t = await getTranslator(input.locale, "email.invitation");
  return {
    subject: t("subject", { inviter: input.inviterName, tenant: input.tenantName }),
    html: layout(
      `
      ${heading(t("title", { tenant: input.tenantName }))}
      ${paragraph(t("body", { inviter: input.inviterName }))}
      ${button(input.acceptUrl, t("cta"))}
    `,
      input.locale ?? DEFAULT_LOCALE,
    ),
  };
}

export async function passwordResetEmail(input: {
  resetUrl: string;
  locale?: string | null;
}): Promise<Email> {
  const t = await getTranslator(input.locale, "email.passwordReset");
  return {
    subject: t("subject"),
    html: layout(
      `
      ${heading(t("title"))}
      ${paragraph(t("body"))}
      ${button(input.resetUrl, t("cta"))}
    `,
      input.locale ?? DEFAULT_LOCALE,
    ),
  };
}

export async function subscriptionExpiryWarningEmail(input: {
  tenantName: string;
  expiresAt: Date;
  daysRemaining: number;
  locale?: string | null;
}): Promise<Email> {
  const t = await getTranslator(input.locale, "email.subscriptionExpiry");
  const date = formatDate(input.expiresAt, input.locale ?? DEFAULT_LOCALE, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return {
    subject: t("subject", { days: input.daysRemaining }),
    html: layout(
      `
      ${heading(t("title"))}
      ${paragraph(t("body", { tenant: input.tenantName, date, grace: GRACE_PERIOD_DAYS }))}
    `,
      input.locale ?? DEFAULT_LOCALE,
    ),
  };
}

/**
 * Per-site ingest alert (PLAN.md §5.2.5). Deliberately says what broke, when,
 * and where to look — and nothing else: no submitted data, no API key, no
 * webhook token. The reason arrives as a short code from
 * modules/sites/health.ts and is resolved through the messages file.
 */
export async function siteIngestAlertEmail(input: {
  siteName: string;
  kind: "failing" | "stale";
  reason?: string | null;
  status?: number | null;
  lastSuccessAt?: Date | null;
  daysSilent?: number;
  sitesUrl: string;
  locale?: string | null;
}): Promise<Email> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const t = await getTranslator(locale, "email.siteIngestAlert");

  const lastLead = input.lastSuccessAt
    ? t("lastLead", {
        date: formatDate(input.lastSuccessAt, locale, {
          day: "2-digit",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        }),
      })
    : t("noLeadYet");

  if (input.kind === "stale") {
    return {
      subject: t("staleSubject", { site: input.siteName, days: input.daysSilent ?? 0 }),
      html: layout(
        `
        ${heading(t("staleTitle", { site: input.siteName }))}
        ${paragraph(t("staleBody", { days: input.daysSilent ?? 0, lastLead }))}
        ${paragraph(`<a href="${input.sitesUrl}">${t("staleLink")}</a>`)}
      `,
        locale,
      ),
    };
  }

  const reasonKey = input.reason ?? "unknown";
  const reason = t.has(`reasons.${reasonKey}`) ? t(`reasons.${reasonKey}`) : t("reasons.unknown");

  return {
    subject: t("failingSubject", { site: input.siteName }),
    html: layout(
      `
      ${heading(t("failingTitle", { site: input.siteName }))}
      ${paragraph(t("failingBody", { status: input.status ?? 0, reason }))}
      ${paragraph(lastLead)}
      ${paragraph(`<a href="${input.sitesUrl}">${t("failingLink")}</a>`)}
    `,
      locale,
    ),
  };
}


/**
 * Daily "what's due" digest (PLAN.md §13 H6). Deliberately a list of the
 * recipient's own tasks with a link each, and nothing else: the email is a
 * nudge back into the CRM, not a place to work from.
 */
export async function taskRemindersEmail(input: {
  userName: string;
  items: Array<{
    title: string;
    dueAt: Date;
    overdue: boolean;
    contactName: string | null;
    url: string;
  }>;
  /** The day's appointments, when there are any — the agenda half of the
   * same mail (modules/crm/task-reminders.ts). */
  appointments?: Array<{
    title: string;
    startsAt: Date;
    allDay: boolean;
    location: string | null;
    contactName: string | null;
    url: string;
  }>;
  tasksUrl: string;
  locale?: string | null;
}): Promise<Email> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const t = await getTranslator(locale, "email.taskReminders");

  const overdueCount = input.items.filter((item) => item.overdue).length;
  const appointments = input.appointments ?? [];

  const rows = input.items
    .map((item) => {
      const when = formatDate(item.dueAt, locale, {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const who = item.contactName ? ` · ${item.contactName}` : "";
      const flag = item.overdue ? ` · <strong>${t("overdue")}</strong>` : "";
      return `<li style="margin-bottom:8px;"><a href="${item.url}">${item.title}</a><br /><span style="color:#71717a;">${when}${who}${flag}</span></li>`;
    })
    .join("");

  const appointmentRows = appointments
    .map((appointment) => {
      const when = appointment.allDay
        ? t("allDay")
        : formatDate(appointment.startsAt, locale, {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
      const where = appointment.location ? ` · ${appointment.location}` : "";
      const who = appointment.contactName ? ` · ${appointment.contactName}` : "";
      return `<li style="margin-bottom:8px;"><a href="${appointment.url}">${appointment.title}</a><br /><span style="color:#71717a;">${when}${who}${where}</span></li>`;
    })
    .join("");

  // Whichever half is empty is left out entirely: a heading over nothing
  // reads as a bug, and both halves are optional by construction (the sender
  // skips a user only when both are empty).
  const taskSection =
    input.items.length > 0
      ? `
      ${paragraph(t("body", { count: input.items.length, overdue: overdueCount }))}
      <ul style="font-size:14px;line-height:1.5;color:#3f3f46;padding-left:18px;">${rows}</ul>`
      : "";

  const appointmentSection =
    appointments.length > 0
      ? `
      ${paragraph(t("appointmentsBody", { count: appointments.length }))}
      <ul style="font-size:14px;line-height:1.5;color:#3f3f46;padding-left:18px;">${appointmentRows}</ul>`
      : "";

  return {
    subject:
      input.items.length > 0
        ? t("subject", { count: input.items.length })
        : t("appointmentsSubject", { count: appointments.length }),
    html: layout(
      `
      ${heading(t("title", { name: input.userName }))}
      ${taskSection}
      ${appointmentSection}
      ${button(input.tasksUrl, t("cta"))}
    `,
      locale,
    ),
  };
}

// --- Customer-facing documents ----------------------------------------------
//
// The three mails that make this product e-post-first (plan.md §5.3.2): an
// offert, a faktura, and a betalningspåminnelse. Unlike the account mails
// above, these go to the *tenant's customer*, not to a user of the app — so
// they name the tenant, they follow the tenant's locale, and the payment
// details on them are the tenant's.
//
// Each one is a covering letter for a link, deliberately. The document itself
// lives at its public token URL, which already renders the legally complete
// faktura and serves the PDF (§5.2.3); duplicating the line items into an
// email body would create a second rendering of a fiscal document that can
// disagree with the first. The amount and the payment block are here because
// those are what makes the mail readable at a glance in an inbox — and both
// are read off the same document row the page renders.
//
// No attachment: an emailed PDF is a copy that goes stale the moment a
// payment is recorded, and Resend attachments cost the send a size limit.
// The link always shows current state.

/** The "Betala till bankgiro …, OCR …" line, or nothing when the tenant has
 * not filled in a payment account yet (KNOWN-ISSUES O2-3: issuing is not
 * blocked on it, so the mail must survive its absence). */
function paymentLine(
  t: Awaited<ReturnType<typeof getTranslator>>,
  input: { paymentAccount?: string | null; ocrNumber?: string | null },
): string | null {
  if (!input.paymentAccount) return null;
  return input.ocrNumber
    ? t("payment", { account: input.paymentAccount, ocr: input.ocrNumber })
    : t("paymentNoOcr", { account: input.paymentAccount });
}

/** The button plus the same URL in plain text underneath. A link that only
 * exists inside an anchor is a link a customer on a locked-down mail client
 * cannot follow, and this one is the whole point of the message. */
function linkBlock(
  t: Awaited<ReturnType<typeof getTranslator>>,
  url: string,
  ctaKey: "cta" = "cta",
): string {
  return `
      ${button(url, t(ctaKey))}
      <p style="margin-top:16px;font-size:12px;line-height:1.5;color:#71717a;word-break:break-all;">${t(
        "fallback",
        { url },
      )}</p>`;
}

export async function quoteEmail(input: {
  tenantName: string;
  contactName: string;
  number: string;
  /** Gross, in minor units — an offert is quoted inklusive moms (§5.2). */
  amount: number;
  currency: string;
  validUntil: Date | null;
  publicUrl: string;
  locale?: string | null;
}): Promise<Email> {
  const locale = input.locale ?? "sv";
  const t = await getTranslator(locale, "email.quote");
  const amount = formatMoney(input.amount, input.currency, locale);

  const validUntil = input.validUntil
    ? paragraph(
        t("validUntil", {
          date: formatDate(input.validUntil, locale, {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
        }),
      )
    : "";

  return {
    subject: t("subject", { number: input.number, tenant: input.tenantName }),
    html: layout(
      `
      ${heading(t("title", { number: input.number }))}
      ${paragraph(
        t("body", { name: input.contactName, tenant: input.tenantName, amount }),
      )}
      ${validUntil}
      ${linkBlock(t, input.publicUrl)}
    `,
      locale,
    ),
  };
}

export async function invoiceEmail(input: {
  tenantName: string;
  contactName: string;
  number: string;
  /** Brutto — what the customer actually pays (§5.2, where `total` is netto). */
  amount: number;
  currency: string;
  dueAt: Date | null;
  paymentAccount?: string | null;
  ocrNumber?: string | null;
  /** Set on a kreditfaktura: the number of the faktura it reverses. */
  creditsNumber?: string | null;
  publicUrl: string;
  locale?: string | null;
}): Promise<Email> {
  const locale = input.locale ?? "sv";
  const t = await getTranslator(locale, "email.invoice");
  const isCredit = !!input.creditsNumber;
  const amount = formatMoney(input.amount, input.currency, locale);

  // A kreditfaktura is not a bill: it has no förfallodatum to chase and no
  // payment block, because nobody is being asked to pay it. Saying "betala
  // till bankgiro …" on a credit note is how a customer pays twice.
  const dueAt =
    !isCredit && input.dueAt
      ? paragraph(
          t("dueAt", {
            date: formatDate(input.dueAt, locale, {
              day: "2-digit",
              month: "long",
              year: "numeric",
            }),
          }),
        )
      : "";
  const payment = isCredit ? null : paymentLine(t, input);

  return {
    subject: t(isCredit ? "creditSubject" : "subject", {
      number: input.number,
      tenant: input.tenantName,
    }),
    html: layout(
      `
      ${heading(t(isCredit ? "creditTitle" : "title", { number: input.number }))}
      ${paragraph(
        isCredit
          ? t("creditBody", {
              name: input.contactName,
              tenant: input.tenantName,
              amount,
              credits: input.creditsNumber ?? "",
            })
          : t("body", { name: input.contactName, tenant: input.tenantName, amount }),
      )}
      ${dueAt}
      ${payment ? paragraph(payment) : ""}
      ${linkBlock(t, input.publicUrl)}
    `,
      locale,
    ),
  };
}

/**
 * Betalningspåminnelse (plan.md §5.3.2). Says what is outstanding and how to
 * pay it, and nothing more: no dröjsmålsränta, no förseningsavgift, no
 * threat. Those are configurable fields with no automation behind them by
 * decision (plan.md §3, Backlog), and a reminder that quotes an interest rate
 * this product does not actually calculate would be inventing a number
 * (sweden-business-apps §8).
 *
 * The "already paid, ignore this" line is not politeness. A payment recorded
 * in the tenant's bank but not yet in the CRM is the normal case for a
 * reminder that has crossed a payment in the post, and the customer needs to
 * be told they can disregard it rather than paying twice.
 */
export async function paymentReminderEmail(input: {
  tenantName: string;
  contactName: string;
  number: string;
  /** The balance still outstanding, not the invoice total. */
  amount: number;
  currency: string;
  dueAt: Date | null;
  overdue: boolean;
  paymentAccount?: string | null;
  ocrNumber?: string | null;
  publicUrl: string;
  locale?: string | null;
}): Promise<Email> {
  const locale = input.locale ?? "sv";
  const t = await getTranslator(locale, "email.paymentReminder");
  const amount = formatMoney(input.amount, input.currency, locale);
  const dueDate = input.dueAt
    ? formatDate(input.dueAt, locale, { day: "2-digit", month: "long", year: "numeric" })
    : null;

  const payment = paymentLine(t, input);

  return {
    subject: t(input.overdue ? "overdueSubject" : "subject", {
      number: input.number,
      date: dueDate ?? "",
    }),
    html: layout(
      `
      ${heading(t("title", { number: input.number }))}
      ${paragraph(
        t("body", { name: input.contactName, tenant: input.tenantName, number: input.number, amount }),
      )}
      ${dueDate ? paragraph(t(input.overdue ? "overdue" : "dueAt", { date: dueDate })) : ""}
      ${payment ? paragraph(payment) : ""}
      ${paragraph(t("crossed"))}
      ${linkBlock(t, input.publicUrl)}
    `,
      locale,
    ),
  };
}
