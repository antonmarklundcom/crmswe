CREATE TABLE `document_items` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`document_id` char(26) NOT NULL,
	`product_id` char(26),
	`description` varchar(500) NOT NULL,
	`qty` int NOT NULL DEFAULT 1,
	`unit_price` bigint NOT NULL DEFAULT 0,
	`line_total` bigint NOT NULL DEFAULT 0,
	`position` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `document_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_payments` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`document_id` char(26) NOT NULL,
	`amount` bigint NOT NULL DEFAULT 0,
	`currency` char(3) NOT NULL DEFAULT 'PYG',
	`method` varchar(20) NOT NULL DEFAULT 'cash',
	`reference` varchar(200),
	`paid_at` datetime NOT NULL,
	`recorded_by_user_id` char(26),
	`notes` varchar(500),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `document_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_sequences` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`doc_type` varchar(20) NOT NULL,
	`prefix` varchar(10) NOT NULL DEFAULT 'NV',
	`next_number` int NOT NULL DEFAULT 1,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `document_sequences_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_sequences_tenant_type_idx` UNIQUE(`tenant_id`,`doc_type`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`type` varchar(20) NOT NULL DEFAULT 'nota_venta',
	`number` varchar(30) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`deal_id` char(26),
	`quote_id` char(26),
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`currency` char(3) NOT NULL DEFAULT 'PYG',
	`subtotal` bigint NOT NULL DEFAULT 0,
	`discount` bigint NOT NULL DEFAULT 0,
	`total` bigint NOT NULL DEFAULT 0,
	`issued_at` datetime,
	`due_at` datetime,
	`notes` text,
	`public_token` varchar(64) NOT NULL,
	`pdf_storage_key` varchar(500),
	`voided_at` datetime,
	`void_reason` varchar(500),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `documents_tenant_number_idx` UNIQUE(`tenant_id`,`number`),
	CONSTRAINT `documents_public_token_idx` UNIQUE(`public_token`)
);
--> statement-breakpoint
CREATE INDEX `document_items_tenant_id_idx` ON `document_items` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `document_items_document_id_idx` ON `document_items` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_payments_tenant_id_idx` ON `document_payments` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `document_payments_document_id_idx` ON `document_payments` (`document_id`);--> statement-breakpoint
CREATE INDEX `documents_tenant_id_idx` ON `documents` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `documents_tenant_contact_idx` ON `documents` (`tenant_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `documents_tenant_status_idx` ON `documents` (`tenant_id`,`status`);