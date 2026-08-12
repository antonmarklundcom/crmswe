CREATE TABLE `site_ingest_health` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`site_id` char(26) NOT NULL,
	`last_outcome` varchar(10),
	`last_success_at` datetime,
	`last_success_lane` varchar(10),
	`last_error_at` datetime,
	`last_error_status` int,
	`last_error_reason` varchar(200),
	`last_error_lane` varchar(10),
	`success_count` int NOT NULL DEFAULT 0,
	`error_count` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `site_ingest_health_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_ingest_health_site_id_idx` UNIQUE(`site_id`)
);
--> statement-breakpoint
CREATE INDEX `site_ingest_health_tenant_id_idx` ON `site_ingest_health` (`tenant_id`);