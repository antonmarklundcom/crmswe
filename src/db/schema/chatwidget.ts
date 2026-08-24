import {
  mysqlTable,
  char,
  varchar,
  boolean,
  json,
  datetime,
  index,
  uniqueIndex,
  text,
  int,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// The embeddable website chat widget (docs/SPEC-CHAT-WIDGET.md).
//
// Its own conversation tables rather than WhatsApp's, and the schema is why:
// `conversations` is NOT NULL on both `wa_account_id` and `contact_id`, and
// `contacts.phone` is NOT NULL and unique per tenant (§4, §5). A website
// visitor has no WhatsApp account and no phone number, so reusing those
// tables would mean nulling three columns the whole WhatsApp pipeline relies
// on and inventing placeholder phone numbers.
//
// What *is* reused is the shape: `chat_messages` copies the `messages`
// status/audit vocabulary — direction, a status enum, an error JSON column, a
// sender, an audit pointer at the AI row — so a rep reading either table
// reads the same thing.

/**
 * Per-site widget configuration. Per *site*, not per tenant, because §1.2
 * locks one tenant owning many sites and a client's branding, greeting and
 * system prompt are per-site facts. A tenant with one site has one widget and
 * never notices the distinction.
 *
 * A table rather than `sites.settings` JSON (where Turnstile lives): this is
 * read on a public request path for every page load of every client site, it
 * needs a unique-indexed lookup key, and it is edited by a form with a dozen
 * fields. Closer to a `forms` row than to configuration.
 */
export const chatWidgets = mysqlTable(
  "chat_widgets",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    siteId: char("site_id", { length: 26 }).notNull(),
    /**
     * The identifier in the embed snippet. **Public by design and not a
     * credential** — the same category as a Turnstile *site* key, which also
     * renders into page source. Nothing is authorised by holding it; what
     * defends the endpoint is the origin allowlist, the rate limits and the
     * spend caps.
     */
    widgetKey: varchar("widget_key", { length: 40 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),

    /** off | draft | send — the tenant AI mode is a ceiling over this. */
    mode: varchar("mode", { length: 6, enum: ["off", "draft", "send"] })
      .notNull()
      .default("draft"),

    name: varchar("name", { length: 200 }).notNull(),
    avatarUrl: varchar("avatar_url", { length: 2000 }),
    primaryColor: varchar("primary_color", { length: 20 }),
    greeting: varchar("greeting", { length: 500 }),
    launcherLabel: varchar("launcher_label", { length: 100 }),
    position: varchar("position", { length: 5, enum: ["right", "left"] })
      .notNull()
      .default("right"),
    offlineMessage: varchar("offline_message", { length: 500 }),

    /** Appended to lib/ai's guardrail block, never replacing it. */
    systemPrompt: text("system_prompt"),
    neverPromise: text("never_promise"),
    maxRepliesPerConversationPerDay: int("max_replies_per_conversation_per_day"),

    askForPhone: boolean("ask_for_phone").notNull().default(true),
    captureAfterMessages: int("capture_after_messages").notNull().default(2),

    // Routing, read from this row and never from the caller (§5.1).
    createDeal: boolean("create_deal").notNull().default(false),
    defaultPipelineId: char("default_pipeline_id", { length: 26 }),
    defaultStageId: char("default_stage_id", { length: 26 }),
    defaultTagIds: json("default_tag_ids"),
    defaultOwnerUserId: char("default_owner_user_id", { length: 26 }),

    /** string[]. Empty means any origin — the UI says so plainly. */
    allowedOrigins: json("allowed_origins"),
    /** always | business_hours — outside hours, capture without a token spent. */
    businessHoursMode: varchar("business_hours_mode", {
      length: 15,
      enum: ["always", "business_hours"],
    })
      .notNull()
      .default("always"),

    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("chat_widgets_key_idx").on(table.widgetKey),
    uniqueIndex("chat_widgets_tenant_site_idx").on(table.tenantId, table.siteId),
  ],
);

export const chatConversations = mysqlTable(
  "chat_conversations",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    widgetId: char("widget_id", { length: 26 }).notNull(),
    siteId: char("site_id", { length: 26 }).notNull(),
    /** Minted in the iframe and kept in a first-party cookie on *our* origin,
     * so a returning visitor keeps their thread. */
    visitorId: char("visitor_id", { length: 26 }).notNull(),
    /** Set on capture — before that, "someone is asking and we don't know who". */
    contactId: char("contact_id", { length: 26 }),
    leadSubmissionId: char("lead_submission_id", { length: 26 }),

    status: varchar("status", { length: 6, enum: ["open", "closed"] })
      .notNull()
      .default("open"),
    assignedUserId: char("assigned_user_id", { length: 26 }),
    lastMessageAt: datetime("last_message_at"),
    lastVisitorMessageAt: datetime("last_visitor_message_at"),
    unreadCount: int("unread_count").notNull().default(0),
    /** The per-conversation kill switch — same column and meaning as
     * `conversations.ai_disabled_at` on the WhatsApp side. */
    aiDisabledAt: datetime("ai_disabled_at"),

    pageUrl: varchar("page_url", { length: 2000 }),
    referrer: varchar("referrer", { length: 2000 }),
    utm: json("utm"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 500 }),
    locale: varchar("locale", { length: 10 }),

    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("chat_conversations_tenant_visitor_idx").on(
      table.tenantId,
      table.widgetId,
      table.visitorId,
    ),
    index("chat_conversations_tenant_last_message_idx").on(table.tenantId, table.lastMessageAt),
    index("chat_conversations_tenant_status_idx").on(table.tenantId, table.status),
    index("chat_conversations_tenant_contact_idx").on(table.tenantId, table.contactId),
  ],
);

export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: char("id", { length: 26 }).primaryKey(),
    tenantId: char("tenant_id", { length: 26 }).notNull(),
    chatConversationId: char("chat_conversation_id", { length: 26 }).notNull(),
    direction: varchar("direction", { length: 3, enum: ["in", "out"] }).notNull(),
    author: varchar("author", {
      length: 10,
      enum: ["visitor", "ai", "agent", "system"],
    }).notNull(),
    body: text("body"),
    /** The `messages` vocabulary, minus the delivery states a same-page
     * render doesn't have — nothing here is ever "delivered" by Meta. */
    status: varchar("status", { length: 10, enum: ["queued", "sent", "failed"] })
      .notNull()
      .default("sent"),
    error: json("error"),
    sentByUserId: char("sent_by_user_id", { length: 26 }),
    /** The `ai_replies` row that produced it — prompt, model, token counts. */
    aiReplyId: char("ai_reply_id", { length: 26 }),

    createdAt: datetime("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("chat_messages_tenant_conversation_idx").on(
      table.tenantId,
      table.chatConversationId,
      table.createdAt,
    ),
  ],
);
