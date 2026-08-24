CREATE TABLE `booking_availability_rules` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`resource_id` char(26) NOT NULL,
	`weekday` tinyint NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `booking_availability_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `booking_blackouts` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`resource_id` char(26),
	`starts_at` datetime NOT NULL,
	`ends_at` datetime NOT NULL,
	`reason` varchar(300),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `booking_blackouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `booking_resources` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`kind` varchar(10) NOT NULL DEFAULT 'user',
	`user_id` char(26),
	`name` varchar(200) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `booking_resources_id` PRIMARY KEY(`id`),
	CONSTRAINT `booking_resources_tenant_user_idx` UNIQUE(`tenant_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `booking_type_resources` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`booking_type_id` char(26) NOT NULL,
	`resource_id` char(26) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `booking_type_resources_id` PRIMARY KEY(`id`),
	CONSTRAINT `booking_type_resources_unique_idx` UNIQUE(`tenant_id`,`booking_type_id`,`resource_id`)
);
--> statement-breakpoint
CREATE TABLE `booking_types` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`description` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`color` varchar(20),
	`duration_minutes` int NOT NULL DEFAULT 30,
	`buffer_before_minutes` int NOT NULL DEFAULT 0,
	`buffer_after_minutes` int NOT NULL DEFAULT 0,
	`slot_increment_minutes` int,
	`min_notice_minutes` int NOT NULL DEFAULT 120,
	`max_advance_days` int NOT NULL DEFAULT 60,
	`max_per_day` int,
	`assignment` varchar(15) NOT NULL DEFAULT 'any',
	`location_mode` varchar(15) NOT NULL DEFAULT 'in_person',
	`location_detail` varchar(500),
	`create_deal` boolean NOT NULL DEFAULT false,
	`default_pipeline_id` char(26),
	`default_stage_id` char(26),
	`default_tag_ids` json,
	`default_owner_user_id` char(26),
	`questions` json,
	`settings` json,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `booking_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `booking_types_tenant_slug_idx` UNIQUE(`tenant_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`booking_type_id` char(26) NOT NULL,
	`resource_id` char(26) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`calendar_event_id` char(26),
	`deal_id` char(26),
	`lead_submission_id` char(26),
	`starts_at` datetime NOT NULL,
	`ends_at` datetime NOT NULL,
	`status` varchar(12) NOT NULL DEFAULT 'confirmed',
	`cancelled_at` datetime,
	`cancelled_by` varchar(10),
	`cancel_reason` varchar(500),
	`rescheduled_from_id` char(26),
	`public_token` varchar(64) NOT NULL,
	`answers` json,
	`source` varchar(100),
	`utm` json,
	`page_url` varchar(2000),
	`referrer` varchar(2000),
	`ip_address` varchar(45),
	`user_agent` varchar(500),
	`reminder_job_id` char(26),
	`reminder_sent_at` datetime,
	`active_slot` varchar(80),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`),
	CONSTRAINT `bookings_public_token_idx` UNIQUE(`public_token`),
	CONSTRAINT `bookings_tenant_active_slot_idx` UNIQUE(`tenant_id`,`active_slot`)
);
--> statement-breakpoint
ALTER TABLE `lead_submissions` ADD `booking_type_id` char(26);--> statement-breakpoint
CREATE INDEX `booking_rules_tenant_resource_idx` ON `booking_availability_rules` (`tenant_id`,`resource_id`,`weekday`);--> statement-breakpoint
CREATE INDEX `booking_blackouts_tenant_starts_idx` ON `booking_blackouts` (`tenant_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `booking_resources_tenant_idx` ON `booking_resources` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `booking_type_resources_resource_idx` ON `booking_type_resources` (`tenant_id`,`resource_id`);--> statement-breakpoint
CREATE INDEX `booking_types_tenant_active_idx` ON `booking_types` (`tenant_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `bookings_tenant_starts_idx` ON `bookings` (`tenant_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `bookings_tenant_resource_starts_idx` ON `bookings` (`tenant_id`,`resource_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `bookings_tenant_contact_idx` ON `bookings` (`tenant_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `bookings_tenant_status_idx` ON `bookings` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `lead_submissions_booking_type_id_idx` ON `lead_submissions` (`booking_type_id`);