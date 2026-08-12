CREATE TABLE `site_hook_captures` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`site_id` char(26) NOT NULL,
	`payload` json NOT NULL DEFAULT ('{}'),
	`content_type` varchar(100),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `site_hook_captures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sites` ADD `hook_token_hash` char(64);--> statement-breakpoint
ALTER TABLE `sites` ADD `hook_token_prefix` varchar(16);--> statement-breakpoint
ALTER TABLE `sites` ADD `hook_token_last_used_at` datetime;--> statement-breakpoint
ALTER TABLE `sites` ADD CONSTRAINT `sites_hook_token_hash_idx` UNIQUE(`hook_token_hash`);--> statement-breakpoint
CREATE INDEX `site_hook_captures_tenant_id_idx` ON `site_hook_captures` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `site_hook_captures_site_id_idx` ON `site_hook_captures` (`site_id`);