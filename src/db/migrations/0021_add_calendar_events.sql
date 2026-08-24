CREATE TABLE `calendar_events` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`title` varchar(300) NOT NULL,
	`description` text,
	`starts_at` datetime NOT NULL,
	`ends_at` datetime NOT NULL,
	`all_day` boolean NOT NULL DEFAULT false,
	`location` varchar(300),
	`contact_id` char(26),
	`deal_id` char(26),
	`assigned_user_id` char(26),
	`created_by_user_id` char(26) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `calendar_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `calendar_events_tenant_starts_idx` ON `calendar_events` (`tenant_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `calendar_events_tenant_assigned_idx` ON `calendar_events` (`tenant_id`,`assigned_user_id`);--> statement-breakpoint
CREATE INDEX `calendar_events_tenant_contact_idx` ON `calendar_events` (`tenant_id`,`contact_id`);