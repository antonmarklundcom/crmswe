CREATE TABLE `contact_views` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`created_by_user_id` char(26) NOT NULL,
	`name` varchar(100) NOT NULL,
	`query` varchar(1000) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `contact_views_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_views_tenant_name_idx` UNIQUE(`tenant_id`,`name`)
);
--> statement-breakpoint
CREATE INDEX `contact_views_tenant_id_idx` ON `contact_views` (`tenant_id`);