CREATE TABLE `ai_replies` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`conversation_id` char(26) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`message_id` char(26),
	`flow_run_id` char(26),
	`node_id` varchar(100),
	`mode` varchar(10) NOT NULL DEFAULT 'draft',
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`prompt` text NOT NULL,
	`body` text,
	`provider` varchar(20),
	`model` varchar(100),
	`prompt_tokens` int NOT NULL DEFAULT 0,
	`completion_tokens` int NOT NULL DEFAULT 0,
	`approved_by_user_id` char(26),
	`sent_at` datetime,
	`error` varchar(2000),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ai_replies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `ai_disabled_at` datetime;--> statement-breakpoint
CREATE INDEX `ai_replies_tenant_id_idx` ON `ai_replies` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `ai_replies_tenant_conversation_idx` ON `ai_replies` (`tenant_id`,`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_replies_tenant_created_idx` ON `ai_replies` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_replies_tenant_status_idx` ON `ai_replies` (`tenant_id`,`status`);