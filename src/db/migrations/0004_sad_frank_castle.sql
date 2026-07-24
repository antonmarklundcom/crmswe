CREATE TABLE `conversations` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`wa_account_id` char(26) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`assigned_user_id` char(26),
	`status` varchar(20) NOT NULL DEFAULT 'open',
	`last_message_at` datetime,
	`last_inbound_at` datetime,
	`unread_count` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `conversations_account_contact_idx` UNIQUE(`wa_account_id`,`contact_id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`conversation_id` char(26) NOT NULL,
	`direction` varchar(3) NOT NULL,
	`wa_message_id` varchar(100),
	`type` varchar(20) NOT NULL,
	`body` text,
	`media_id` varchar(200),
	`storage_key` varchar(500),
	`status` varchar(20) NOT NULL DEFAULT 'queued',
	`error` json,
	`sent_by_user_id` char(26),
	`automation_run_id` char(26),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `messages_wa_message_id_idx` UNIQUE(`wa_message_id`)
);
--> statement-breakpoint
CREATE TABLE `wa_accounts` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`waba_id` varchar(100) NOT NULL,
	`phone_number_id` varchar(100) NOT NULL,
	`display_number` varchar(30),
	`verified_name` varchar(200),
	`status` varchar(20) NOT NULL DEFAULT 'connected',
	`quality_rating` varchar(20),
	`access_token_ciphertext` text NOT NULL,
	`access_token_iv` varchar(64) NOT NULL,
	`access_token_tag` varchar(64) NOT NULL,
	`connected_via` varchar(20) NOT NULL DEFAULT 'manual',
	`webhook_subscribed_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `wa_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `wa_accounts_phone_number_id_idx` UNIQUE(`phone_number_id`)
);
--> statement-breakpoint
CREATE TABLE `wa_templates` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`wa_account_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`language` varchar(10) NOT NULL,
	`category` varchar(30),
	`status` varchar(20) NOT NULL DEFAULT 'PENDING',
	`components` json NOT NULL DEFAULT ('[]'),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `wa_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` char(26) NOT NULL,
	`payload` json NOT NULL,
	`phone_number_id` varchar(100),
	`status` varchar(20) NOT NULL DEFAULT 'received',
	`error` varchar(2000),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `conversations_tenant_id_idx` ON `conversations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `conversations_tenant_assigned_idx` ON `conversations` (`tenant_id`,`assigned_user_id`);--> statement-breakpoint
CREATE INDEX `messages_tenant_id_idx` ON `messages` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `wa_accounts_tenant_id_idx` ON `wa_accounts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `wa_templates_tenant_id_idx` ON `wa_templates` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `wa_templates_account_id_idx` ON `wa_templates` (`wa_account_id`);--> statement-breakpoint
CREATE INDEX `webhook_events_phone_number_id_idx` ON `webhook_events` (`phone_number_id`);--> statement-breakpoint
CREATE INDEX `webhook_events_status_idx` ON `webhook_events` (`status`);