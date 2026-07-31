CREATE TABLE `tasks` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`deal_id` char(26),
	`title` varchar(300) NOT NULL,
	`due_at` datetime NOT NULL,
	`assigned_user_id` char(26),
	`completed_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `tasks_tenant_contact_idx` ON `tasks` (`tenant_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `tasks_tenant_deal_idx` ON `tasks` (`tenant_id`,`deal_id`);--> statement-breakpoint
CREATE INDEX `tasks_tenant_due_idx` ON `tasks` (`tenant_id`,`completed_at`,`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_tenant_assigned_idx` ON `tasks` (`tenant_id`,`assigned_user_id`);