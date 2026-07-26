CREATE TABLE `lead_submissions` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`site_id` char(26),
	`form_id` char(26),
	`contact_id` char(26) NOT NULL,
	`deal_id` char(26),
	`payload` json NOT NULL DEFAULT ('{}'),
	`utm` json NOT NULL DEFAULT ('{}'),
	`page_url` varchar(2000),
	`referrer` varchar(2000),
	`ip_address` varchar(45),
	`user_agent` varchar(500),
	`idempotency_key` varchar(100),
	`notes` text,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `lead_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `lead_submissions_idempotency_idx` UNIQUE(`tenant_id`,`site_id`,`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`domain` varchar(255),
	`api_key_hash` char(64) NOT NULL,
	`api_key_prefix` varchar(16) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`default_pipeline_id` char(26),
	`default_stage_id` char(26),
	`default_owner_user_id` char(26),
	`default_tag_ids` json NOT NULL DEFAULT ('[]'),
	`wa_account_id` char(26),
	`settings` json NOT NULL DEFAULT ('{}'),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sites_id` PRIMARY KEY(`id`),
	CONSTRAINT `sites_tenant_slug_idx` UNIQUE(`tenant_id`,`slug`),
	CONSTRAINT `sites_api_key_hash_idx` UNIQUE(`api_key_hash`)
);
--> statement-breakpoint
ALTER TABLE `contacts` ADD `first_site_id` char(26);--> statement-breakpoint
ALTER TABLE `contacts` ADD `first_touch_utm` json;--> statement-breakpoint
CREATE INDEX `lead_submissions_tenant_id_idx` ON `lead_submissions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `lead_submissions_site_id_idx` ON `lead_submissions` (`site_id`);--> statement-breakpoint
CREATE INDEX `lead_submissions_form_id_idx` ON `lead_submissions` (`form_id`);--> statement-breakpoint
CREATE INDEX `lead_submissions_contact_id_idx` ON `lead_submissions` (`contact_id`);--> statement-breakpoint
CREATE INDEX `sites_tenant_id_idx` ON `sites` (`tenant_id`);