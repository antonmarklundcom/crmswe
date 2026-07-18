CREATE TABLE `audit_log` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26),
	`actor_user_id` char(26) NOT NULL,
	`impersonator_user_id` char(26),
	`action` varchar(100) NOT NULL,
	`entity` varchar(100) NOT NULL,
	`entity_id` varchar(100) NOT NULL,
	`payload` json NOT NULL DEFAULT ('{}'),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` varchar(20) NOT NULL,
	`token` varchar(64) NOT NULL,
	`invited_by` char(26) NOT NULL,
	`accepted_at` datetime,
	`expires_at` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitations_token_idx` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` char(26) NOT NULL,
	`subscription_id` char(26) NOT NULL,
	`amount` bigint NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'PYG',
	`method` varchar(20) NOT NULL,
	`reference` varchar(200),
	`recorded_by` char(26) NOT NULL,
	`notes` text,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` char(26) NOT NULL,
	`name` varchar(100) NOT NULL,
	`duration_months` int NOT NULL,
	`price` bigint NOT NULL,
	`limits` json NOT NULL DEFAULT ('{}'),
	`features` json NOT NULL DEFAULT ('{"factura_electronica":"coming_soon"}'),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`plan_id` char(26) NOT NULL,
	`starts_at` datetime NOT NULL,
	`expires_at` datetime NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'trial',
	`locale` varchar(10) NOT NULL DEFAULT 'es',
	`timezone` varchar(60) NOT NULL DEFAULT 'America/Asuncion',
	`settings` json NOT NULL DEFAULT ('{}'),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_slug_idx` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26),
	`email` varchar(320) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`name` varchar(200) NOT NULL,
	`image` varchar(2000),
	`role` varchar(20),
	`is_superadmin` boolean NOT NULL DEFAULT false,
	`banned` boolean NOT NULL DEFAULT false,
	`ban_reason` varchar(500),
	`ban_expires` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_idx` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`account_id` varchar(255) NOT NULL,
	`provider_id` varchar(100) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime,
	`refresh_token_expires_at` datetime,
	`scope` varchar(500),
	`password` varchar(255),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires_at` datetime NOT NULL,
	`ip_address` varchar(45),
	`user_agent` varchar(500),
	`impersonated_by` char(26),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_idx` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` char(26) NOT NULL,
	`identifier` varchar(320) NOT NULL,
	`value` varchar(500) NOT NULL,
	`expires_at` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `audit_log_tenant_id_idx` ON `audit_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `invitations_tenant_id_idx` ON `invitations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `invitations_tenant_email_idx` ON `invitations` (`tenant_id`,`email`);--> statement-breakpoint
CREATE INDEX `payments_subscription_id_idx` ON `payments` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_tenant_id_idx` ON `subscriptions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `users_tenant_id_idx` ON `users` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `verifications_identifier_idx` ON `verifications` (`identifier`);