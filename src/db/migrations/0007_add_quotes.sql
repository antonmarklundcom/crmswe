CREATE TABLE `products` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`unit_price` bigint NOT NULL DEFAULT 0,
	`currency` char(3) NOT NULL DEFAULT 'PYG',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote_items` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`quote_id` char(26) NOT NULL,
	`product_id` char(26),
	`description` varchar(500) NOT NULL,
	`qty` int NOT NULL DEFAULT 1,
	`unit_price` bigint NOT NULL DEFAULT 0,
	`line_total` bigint NOT NULL DEFAULT 0,
	`position` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `quote_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote_sequences` (
	`tenant_id` char(26) NOT NULL,
	`next_number` int NOT NULL DEFAULT 1,
	`prefix` varchar(10) NOT NULL DEFAULT 'COT',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `quote_sequences_tenant_id` PRIMARY KEY(`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`deal_id` char(26),
	`number` varchar(30) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`currency` char(3) NOT NULL DEFAULT 'PYG',
	`subtotal` bigint NOT NULL DEFAULT 0,
	`discount` bigint NOT NULL DEFAULT 0,
	`total` bigint NOT NULL DEFAULT 0,
	`valid_until` datetime,
	`notes` text,
	`public_token` varchar(64) NOT NULL,
	`pdf_storage_key` varchar(500),
	`sent_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `quotes_tenant_number_idx` UNIQUE(`tenant_id`,`number`),
	CONSTRAINT `quotes_public_token_idx` UNIQUE(`public_token`)
);
--> statement-breakpoint
CREATE INDEX `products_tenant_id_idx` ON `products` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `quote_items_tenant_id_idx` ON `quote_items` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `quote_items_quote_id_idx` ON `quote_items` (`quote_id`);--> statement-breakpoint
CREATE INDEX `quotes_tenant_id_idx` ON `quotes` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `quotes_tenant_contact_idx` ON `quotes` (`tenant_id`,`contact_id`);