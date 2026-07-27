CREATE TABLE `activities` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`deal_id` char(26),
	`type` varchar(30) NOT NULL,
	`payload` json NOT NULL DEFAULT ('{}'),
	`user_id` char(26),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_tags` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`tag_id` char(26) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `contact_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_tags_contact_tag_idx` UNIQUE(`contact_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`email` varchar(320),
	`notes` text,
	`source` varchar(100),
	`owner_user_id` char(26),
	`custom` json NOT NULL DEFAULT ('{}'),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contacts_tenant_phone_idx` UNIQUE(`tenant_id`,`phone`)
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`pipeline_id` char(26) NOT NULL,
	`stage_id` char(26) NOT NULL,
	`title` varchar(200) NOT NULL,
	`value` bigint NOT NULL DEFAULT 0,
	`currency` char(3) NOT NULL DEFAULT 'PYG',
	`assigned_user_id` char(26),
	`position` int NOT NULL DEFAULT 0,
	`stage_entered_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`closed_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `deals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pipelines` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `pipelines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stages` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`pipeline_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`color` varchar(20),
	`is_won` boolean NOT NULL DEFAULT false,
	`is_lost` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `stages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(20),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_tenant_name_idx` UNIQUE(`tenant_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `form_submissions` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`form_id` char(26) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`data` json NOT NULL DEFAULT ('{}'),
	`ip_address` varchar(45),
	`user_agent` varchar(500),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `form_submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forms` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`fields` json NOT NULL DEFAULT ('[]'),
	`settings` json NOT NULL DEFAULT ('{}'),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `forms_id` PRIMARY KEY(`id`),
	CONSTRAINT `forms_tenant_slug_idx` UNIQUE(`tenant_id`,`slug`)
);
--> statement-breakpoint
CREATE INDEX `activities_tenant_contact_idx` ON `activities` (`tenant_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `activities_tenant_deal_idx` ON `activities` (`tenant_id`,`deal_id`);--> statement-breakpoint
CREATE INDEX `contact_tags_tenant_id_idx` ON `contact_tags` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `contact_tags_tag_id_idx` ON `contact_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `contacts_tenant_id_idx` ON `contacts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `contacts_tenant_owner_idx` ON `contacts` (`tenant_id`,`owner_user_id`);--> statement-breakpoint
CREATE INDEX `deals_tenant_id_idx` ON `deals` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `deals_tenant_stage_idx` ON `deals` (`tenant_id`,`stage_id`);--> statement-breakpoint
CREATE INDEX `deals_tenant_contact_idx` ON `deals` (`tenant_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `deals_tenant_assigned_idx` ON `deals` (`tenant_id`,`assigned_user_id`);--> statement-breakpoint
CREATE INDEX `pipelines_tenant_id_idx` ON `pipelines` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `stages_tenant_id_idx` ON `stages` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `stages_pipeline_id_idx` ON `stages` (`pipeline_id`);--> statement-breakpoint
CREATE INDEX `tags_tenant_id_idx` ON `tags` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `form_submissions_tenant_id_idx` ON `form_submissions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `form_submissions_form_id_idx` ON `form_submissions` (`form_id`);--> statement-breakpoint
CREATE INDEX `form_submissions_contact_id_idx` ON `form_submissions` (`contact_id`);--> statement-breakpoint
CREATE INDEX `forms_tenant_id_idx` ON `forms` (`tenant_id`);