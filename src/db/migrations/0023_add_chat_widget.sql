CREATE TABLE `chat_conversations` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`widget_id` char(26) NOT NULL,
	`site_id` char(26) NOT NULL,
	`visitor_id` char(26) NOT NULL,
	`contact_id` char(26),
	`lead_submission_id` char(26),
	`status` varchar(6) NOT NULL DEFAULT 'open',
	`assigned_user_id` char(26),
	`last_message_at` datetime,
	`last_visitor_message_at` datetime,
	`unread_count` int NOT NULL DEFAULT 0,
	`ai_disabled_at` datetime,
	`page_url` varchar(2000),
	`referrer` varchar(2000),
	`utm` json,
	`ip_address` varchar(45),
	`user_agent` varchar(500),
	`locale` varchar(10),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `chat_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`chat_conversation_id` char(26) NOT NULL,
	`direction` varchar(3) NOT NULL,
	`author` varchar(10) NOT NULL,
	`body` text,
	`status` varchar(10) NOT NULL DEFAULT 'sent',
	`error` json,
	`sent_by_user_id` char(26),
	`ai_reply_id` char(26),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_widgets` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`site_id` char(26) NOT NULL,
	`widget_key` varchar(40) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`mode` varchar(6) NOT NULL DEFAULT 'draft',
	`name` varchar(200) NOT NULL,
	`avatar_url` varchar(2000),
	`primary_color` varchar(20),
	`greeting` varchar(500),
	`launcher_label` varchar(100),
	`position` varchar(5) NOT NULL DEFAULT 'right',
	`offline_message` varchar(500),
	`system_prompt` text,
	`never_promise` text,
	`max_replies_per_conversation_per_day` int,
	`ask_for_phone` boolean NOT NULL DEFAULT true,
	`capture_after_messages` int NOT NULL DEFAULT 2,
	`create_deal` boolean NOT NULL DEFAULT false,
	`default_pipeline_id` char(26),
	`default_stage_id` char(26),
	`default_tag_ids` json,
	`default_owner_user_id` char(26),
	`allowed_origins` json,
	`business_hours_mode` varchar(15) NOT NULL DEFAULT 'always',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `chat_widgets_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_widgets_key_idx` UNIQUE(`widget_key`),
	CONSTRAINT `chat_widgets_tenant_site_idx` UNIQUE(`tenant_id`,`site_id`)
);
--> statement-breakpoint
ALTER TABLE `ai_replies` MODIFY COLUMN `conversation_id` char(26);--> statement-breakpoint
ALTER TABLE `ai_replies` MODIFY COLUMN `contact_id` char(26);--> statement-breakpoint
ALTER TABLE `ai_replies` ADD `channel` varchar(10) DEFAULT 'whatsapp' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_replies` ADD `chat_conversation_id` char(26);--> statement-breakpoint
CREATE INDEX `chat_conversations_tenant_visitor_idx` ON `chat_conversations` (`tenant_id`,`widget_id`,`visitor_id`);--> statement-breakpoint
CREATE INDEX `chat_conversations_tenant_last_message_idx` ON `chat_conversations` (`tenant_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `chat_conversations_tenant_status_idx` ON `chat_conversations` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `chat_conversations_tenant_contact_idx` ON `chat_conversations` (`tenant_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `chat_messages_tenant_conversation_idx` ON `chat_messages` (`tenant_id`,`chat_conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_replies_tenant_chat_conversation_idx` ON `ai_replies` (`tenant_id`,`chat_conversation_id`,`created_at`);