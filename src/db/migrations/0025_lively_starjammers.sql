CREATE TABLE `rate_limit_buckets` (
	`bucket_key` varchar(191) NOT NULL,
	`hit_count` int NOT NULL DEFAULT 0,
	`reset_at` datetime(3) NOT NULL,
	CONSTRAINT `rate_limit_buckets_bucket_key` PRIMARY KEY(`bucket_key`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`org_nr` varchar(12),
	`phone` varchar(20),
	`email` varchar(320),
	`address` varchar(500),
	`custom` json NOT NULL DEFAULT ('{}'),
	`notes` text,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_tenant_name_idx` UNIQUE(`tenant_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `custom_field_definitions` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`key` varchar(64) NOT NULL,
	`label` varchar(200) NOT NULL,
	`type` varchar(10) NOT NULL,
	`options` json NOT NULL DEFAULT ('[]'),
	`position` int NOT NULL DEFAULT 0,
	`required` boolean NOT NULL DEFAULT false,
	`show_on_card` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `custom_field_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `custom_field_definitions_tenant_key_idx` UNIQUE(`tenant_id`,`key`)
);
--> statement-breakpoint
CREATE TABLE `gcal_connections` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`google_account_email` varchar(320),
	`calendar_id` varchar(320) NOT NULL DEFAULT 'primary',
	`access_token_ciphertext` text NOT NULL,
	`access_token_iv` varchar(64) NOT NULL,
	`access_token_tag` varchar(64) NOT NULL,
	`access_token_expires_at` datetime,
	`refresh_token_ciphertext` text,
	`refresh_token_iv` varchar(64),
	`refresh_token_tag` varchar(64),
	`status` varchar(12) NOT NULL DEFAULT 'connected',
	`last_error` varchar(500),
	`last_busy_read_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `gcal_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `gcal_connections_tenant_user_idx` UNIQUE(`tenant_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `vat_rates` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`rate_bps` int NOT NULL,
	`label` varchar(120) NOT NULL,
	`valid_from` datetime NOT NULL,
	`valid_to` datetime,
	`source` varchar(500) NOT NULL,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `vat_rates_id` PRIMARY KEY(`id`),
	CONSTRAINT `vat_rates_tenant_rate_from_idx` UNIQUE(`tenant_id`,`rate_bps`,`valid_from`)
);
--> statement-breakpoint
CREATE TABLE `quote_acceptances` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`quote_id` char(26) NOT NULL,
	`decision` varchar(10) NOT NULL,
	`name` varchar(200) NOT NULL,
	`comment` varchar(1000),
	`ip_address` varchar(45),
	`user_agent` varchar(500),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `quote_acceptances_id` PRIMARY KEY(`id`),
	CONSTRAINT `quote_acceptances_quote_id_idx` UNIQUE(`quote_id`)
);
--> statement-breakpoint
CREATE TABLE `conversation_notes` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`conversation_id` char(26) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`author_user_id` char(26) NOT NULL,
	`body` text NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `conversation_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quick_replies` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`name` varchar(100) NOT NULL,
	`body` text NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `quick_replies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `booking_notifications` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`booking_id` char(26) NOT NULL,
	`kind` varchar(20) NOT NULL,
	`channel` varchar(12) NOT NULL,
	`status` varchar(10) NOT NULL DEFAULT 'queued',
	`template_name` varchar(200),
	`message_id` char(26),
	`detail` varchar(500),
	`sent_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `booking_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `booking_type_services` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`booking_type_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`extra_duration_minutes` int NOT NULL DEFAULT 0,
	`extra_price` bigint,
	`sort` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `booking_type_services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_facts` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`kind` varchar(10) NOT NULL,
	`title` varchar(300) NOT NULL,
	`body` text,
	`structured` json,
	`tags` json,
	`visibility` varchar(10) NOT NULL DEFAULT 'customer',
	`source` varchar(12) NOT NULL DEFAULT 'manual',
	`confirmed_at` datetime,
	`confirmed_by_user_id` char(26),
	`review_after` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `business_facts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_profiles` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`display_name` varchar(200),
	`legal_name` varchar(200),
	`ruc` varchar(30),
	`vertical_slug` varchar(60),
	`about` text,
	`tone` varchar(10),
	`tone_note` varchar(500),
	`audience` text,
	`differentiators` text,
	`languages` json,
	`website` varchar(500),
	`address` varchar(500),
	`maps_url` varchar(2000),
	`never_promise` text,
	`payment_methods` json,
	`completed_pct` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `business_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_profiles_tenant_id_idx` UNIQUE(`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `memory_imports` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`source_kind` varchar(5) NOT NULL,
	`source_ref` varchar(2000),
	`status` varchar(10) NOT NULL DEFAULT 'pending',
	`extracted_count` int NOT NULL DEFAULT 0,
	`ai_reply_id` char(26),
	`error` varchar(2000),
	`created_by` char(26),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `memory_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `setup_plans` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`status` varchar(10) NOT NULL DEFAULT 'draft',
	`brief` text,
	`conversation` json,
	`preset` json,
	`outcome` json,
	`ai_reply_id` char(26),
	`created_by` char(26),
	`applied_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `setup_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`kind` varchar(40) NOT NULL DEFAULT 'system',
	`title` varchar(200) NOT NULL,
	`body` text,
	`url` varchar(500),
	`read_at` datetime,
	`flow_run_id` char(26),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`endpoint` varchar(500) NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`user_agent` varchar(255),
	`last_seen_at` datetime,
	`failed_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_subscriptions_endpoint_idx` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`to` varchar(320) NOT NULL,
	`subject` varchar(500) NOT NULL,
	`kind` varchar(20) NOT NULL,
	`provider_id` varchar(100),
	`status` varchar(20) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `email_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_email_domains` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`domain` varchar(255) NOT NULL,
	`resend_domain_id` varchar(100),
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`dns_records` json NOT NULL DEFAULT ('[]'),
	`verified_at` datetime,
	`from_local_part` varchar(64),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_email_domains_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_acceptances` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`contract_id` char(26) NOT NULL,
	`name_typed` varchar(200) NOT NULL,
	`decision` varchar(20) NOT NULL,
	`ip_address` varchar(45),
	`user_agent` varchar(500),
	`pdf_sha256` varchar(64) NOT NULL,
	`signature_storage_key` varchar(500),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `contract_acceptances_id` PRIMARY KEY(`id`),
	CONSTRAINT `contract_acceptances_contract_id_idx` UNIQUE(`contract_id`)
);
--> statement-breakpoint
CREATE TABLE `contract_templates` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `contract_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`template_id` char(26) NOT NULL,
	`template_snapshot` text NOT NULL,
	`contact_id` char(26) NOT NULL,
	`deal_id` char(26),
	`quote_id` char(26),
	`number` varchar(30) NOT NULL,
	`rendered_body` text NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`public_token` varchar(64) NOT NULL,
	`pdf_storage_key` varchar(500),
	`signed_pdf_storage_key` varchar(500),
	`sent_at` datetime,
	`decided_at` datetime,
	`voided_at` datetime,
	`void_reason` varchar(500),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contracts_tenant_number_idx` UNIQUE(`tenant_id`,`number`),
	CONSTRAINT `contracts_public_token_idx` UNIQUE(`public_token`)
);
--> statement-breakpoint
CREATE TABLE `coach_briefings` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`week_start` datetime NOT NULL,
	`metrics` json NOT NULL,
	`narrative` text NOT NULL,
	`recommendations` json NOT NULL,
	`source` varchar(10) NOT NULL,
	`ai_reply_id` char(26),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `coach_briefings_id` PRIMARY KEY(`id`),
	CONSTRAINT `coach_briefings_tenant_week_idx` UNIQUE(`tenant_id`,`week_start`)
);
--> statement-breakpoint
CREATE TABLE `ops_batch_rows` (
	`id` char(26) NOT NULL,
	`batch_id` char(26) NOT NULL,
	`domain` varchar(255) NOT NULL,
	`display_name` varchar(200) NOT NULL,
	`tenant_mode` varchar(10) NOT NULL DEFAULT 'new',
	`tenant_id` char(26),
	`details` json NOT NULL DEFAULT ('{}'),
	`state` varchar(20) NOT NULL DEFAULT 'pending',
	`steps` json NOT NULL DEFAULT ('{}'),
	`last_error` json,
	`needs_input` text,
	`site_id` char(26),
	`pipeline_id` char(26),
	`api_key_id` char(26),
	`test_contact_id` char(26),
	`test_deal_id` char(26),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ops_batch_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ops_batches` (
	`id` char(26) NOT NULL,
	`token_id` char(26) NOT NULL,
	`title` varchar(200) NOT NULL,
	`raw_text` text,
	`status` varchar(20) NOT NULL DEFAULT 'open',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ops_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ops_objects` (
	`id` char(26) NOT NULL,
	`token_id` char(26) NOT NULL,
	`batch_id` char(26),
	`row_id` char(26),
	`entity` varchar(20) NOT NULL,
	`entity_id` char(26) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ops_objects_id` PRIMARY KEY(`id`),
	CONSTRAINT `ops_objects_entity_idx` UNIQUE(`entity`,`entity_id`)
);
--> statement-breakpoint
CREATE TABLE `ops_tokens` (
	`id` char(26) NOT NULL,
	`owner_user_id` char(26) NOT NULL,
	`label` varchar(100) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`token_prefix` varchar(16) NOT NULL,
	`allowed_tenant_ids` json NOT NULL DEFAULT ('[]'),
	`expires_at` datetime,
	`revoked_at` datetime,
	`last_used_at` datetime,
	`call_count` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ops_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `ops_tokens_hash_idx` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `payments` MODIFY COLUMN `currency` char(3) NOT NULL DEFAULT 'SEK';--> statement-breakpoint
ALTER TABLE `tenants` MODIFY COLUMN `locale` varchar(10) NOT NULL DEFAULT 'sv';--> statement-breakpoint
ALTER TABLE `tenants` MODIFY COLUMN `timezone` varchar(60) NOT NULL DEFAULT 'Europe/Stockholm';--> statement-breakpoint
ALTER TABLE `deals` MODIFY COLUMN `currency` char(3) NOT NULL DEFAULT 'SEK';--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `currency` char(3) NOT NULL DEFAULT 'SEK';--> statement-breakpoint
ALTER TABLE `quote_sequences` MODIFY COLUMN `prefix` varchar(10) NOT NULL DEFAULT 'OFF';--> statement-breakpoint
ALTER TABLE `quotes` MODIFY COLUMN `currency` char(3) NOT NULL DEFAULT 'SEK';--> statement-breakpoint
ALTER TABLE `document_payments` MODIFY COLUMN `currency` char(3) NOT NULL DEFAULT 'SEK';--> statement-breakpoint
ALTER TABLE `document_sequences` MODIFY COLUMN `prefix` varchar(10) NOT NULL DEFAULT 'FA';--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `type` varchar(20) NOT NULL DEFAULT 'faktura';--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `currency` char(3) NOT NULL DEFAULT 'SEK';--> statement-breakpoint
ALTER TABLE `bookings` MODIFY COLUMN `status` varchar(16) NOT NULL DEFAULT 'confirmed';--> statement-breakpoint
ALTER TABLE `tenants` ADD `currency` char(3) DEFAULT 'SEK' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `org_nr` varchar(12);--> statement-breakpoint
ALTER TABLE `tenants` ADD `moms_reg_nr` varchar(20);--> statement-breakpoint
ALTER TABLE `tenants` ADD `bankgiro` varchar(20);--> statement-breakpoint
ALTER TABLE `tenants` ADD `plusgiro` varchar(20);--> statement-breakpoint
ALTER TABLE `tenants` ADD `f_skatt` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `payment_terms_days` int DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `invoice_footer` text;--> statement-breakpoint
ALTER TABLE `tenants` ADD `contacts_feed_token_hash` char(64);--> statement-breakpoint
ALTER TABLE `users` ADD `theme` varchar(10);--> statement-breakpoint
ALTER TABLE `users` ADD `push_prefs` json;--> statement-breakpoint
ALTER TABLE `contacts` ADD `org_nr` varchar(12);--> statement-breakpoint
ALTER TABLE `contacts` ADD `address_line1` varchar(200);--> statement-breakpoint
ALTER TABLE `contacts` ADD `address_line2` varchar(200);--> statement-breakpoint
ALTER TABLE `contacts` ADD `postal_code` varchar(16);--> statement-breakpoint
ALTER TABLE `contacts` ADD `city` varchar(100);--> statement-breakpoint
ALTER TABLE `contacts` ADD `country` char(2);--> statement-breakpoint
ALTER TABLE `contacts` ADD `company_id` char(26);--> statement-breakpoint
ALTER TABLE `deals` ADD `lost_reason` varchar(500);--> statement-breakpoint
ALTER TABLE `deals` ADD `expected_close_at` datetime;--> statement-breakpoint
ALTER TABLE `stages` ADD `stale_after_days` int;--> statement-breakpoint
ALTER TABLE `products` ADD `vat_rate_bps` int;--> statement-breakpoint
ALTER TABLE `quote_items` ADD `vat_rate_bps` int;--> statement-breakpoint
ALTER TABLE `quote_items` ADD `vat_amount` bigint;--> statement-breakpoint
ALTER TABLE `document_items` ADD `vat_rate_bps` int;--> statement-breakpoint
ALTER TABLE `document_items` ADD `vat_amount` bigint;--> statement-breakpoint
ALTER TABLE `document_payments` ADD `receipt_number` varchar(30);--> statement-breakpoint
ALTER TABLE `document_payments` ADD `receipt_public_token` varchar(64);--> statement-breakpoint
ALTER TABLE `documents` ADD `vat_total` bigint;--> statement-breakpoint
ALTER TABLE `documents` ADD `vat_summary` json;--> statement-breakpoint
ALTER TABLE `documents` ADD `buyer_snapshot` json;--> statement-breakpoint
ALTER TABLE `documents` ADD `seller_snapshot` json;--> statement-breakpoint
ALTER TABLE `documents` ADD `delivery_date` datetime;--> statement-breakpoint
ALTER TABLE `documents` ADD `ocr_number` varchar(30);--> statement-breakpoint
ALTER TABLE `documents` ADD `credits_document_id` char(26);--> statement-breakpoint
ALTER TABLE `messages` ADD `media_mime_type` varchar(120);--> statement-breakpoint
ALTER TABLE `messages` ADD `transcript` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `transcript_status` varchar(10);--> statement-breakpoint
ALTER TABLE `messages` ADD `transcript_model` varchar(100);--> statement-breakpoint
ALTER TABLE `messages` ADD `transcript_at` datetime;--> statement-breakpoint
ALTER TABLE `messages` ADD `transcript_error` varchar(500);--> statement-breakpoint
ALTER TABLE `ai_replies` ADD `kind` varchar(20) DEFAULT 'reply' NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_types` ADD `capacity` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_types` ADD `deposit_amount` bigint;--> statement-breakpoint
ALTER TABLE `booking_types` ADD `deposit_currency` varchar(3) DEFAULT 'SEK' NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_types` ADD `allow_multi_service` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `party_size` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `deposit_confirmed_at` datetime;--> statement-breakpoint
ALTER TABLE `bookings` ADD `deposit_confirmed_by_user_id` char(26);--> statement-breakpoint
ALTER TABLE `bookings` ADD `services` json;--> statement-breakpoint
ALTER TABLE `tenants` ADD CONSTRAINT `tenants_contacts_feed_token_hash_idx` UNIQUE(`contacts_feed_token_hash`);--> statement-breakpoint
ALTER TABLE `document_payments` ADD CONSTRAINT `document_payments_receipt_token_idx` UNIQUE(`receipt_public_token`);--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_tenant_ocr_idx` UNIQUE(`tenant_id`,`ocr_number`);--> statement-breakpoint
CREATE INDEX `rate_limit_buckets_reset_at_idx` ON `rate_limit_buckets` (`reset_at`);--> statement-breakpoint
CREATE INDEX `companies_tenant_id_idx` ON `companies` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `custom_field_definitions_tenant_id_idx` ON `custom_field_definitions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `vat_rates_tenant_id_idx` ON `vat_rates` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `quote_acceptances_tenant_id_idx` ON `quote_acceptances` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `conversation_notes_tenant_id_idx` ON `conversation_notes` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `conversation_notes_conversation_id_idx` ON `conversation_notes` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `conversation_notes_contact_id_idx` ON `conversation_notes` (`contact_id`);--> statement-breakpoint
CREATE INDEX `quick_replies_tenant_id_idx` ON `quick_replies` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `booking_notifications_booking_idx` ON `booking_notifications` (`tenant_id`,`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_notifications_message_idx` ON `booking_notifications` (`tenant_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `booking_type_services_type_idx` ON `booking_type_services` (`tenant_id`,`booking_type_id`,`sort`);--> statement-breakpoint
CREATE INDEX `business_facts_tenant_kind_idx` ON `business_facts` (`tenant_id`,`kind`);--> statement-breakpoint
CREATE INDEX `business_facts_tenant_visibility_idx` ON `business_facts` (`tenant_id`,`visibility`,`confirmed_at`);--> statement-breakpoint
CREATE INDEX `memory_imports_tenant_created_idx` ON `memory_imports` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `setup_plans_tenant_created_idx` ON `setup_plans` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_tenant_user_read_idx` ON `notifications` (`tenant_id`,`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_tenant_user_created_idx` ON `notifications` (`tenant_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_tenant_user_idx` ON `push_subscriptions` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `email_log_tenant_id_idx` ON `email_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `email_log_tenant_created_idx` ON `email_log` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tenant_email_domains_tenant_id_idx` ON `tenant_email_domains` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `tenant_email_domains_status_idx` ON `tenant_email_domains` (`status`);--> statement-breakpoint
CREATE INDEX `contract_acceptances_tenant_id_idx` ON `contract_acceptances` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `contract_templates_tenant_id_idx` ON `contract_templates` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `contract_templates_tenant_active_idx` ON `contract_templates` (`tenant_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `contracts_tenant_id_idx` ON `contracts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `contracts_tenant_contact_idx` ON `contracts` (`tenant_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `contracts_tenant_status_idx` ON `contracts` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `coach_briefings_tenant_id_idx` ON `coach_briefings` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `ops_batch_rows_batch_idx` ON `ops_batch_rows` (`batch_id`);--> statement-breakpoint
CREATE INDEX `ops_batches_token_idx` ON `ops_batches` (`token_id`);--> statement-breakpoint
CREATE INDEX `ops_objects_token_idx` ON `ops_objects` (`token_id`);--> statement-breakpoint
CREATE INDEX `ops_objects_row_idx` ON `ops_objects` (`row_id`);--> statement-breakpoint
CREATE INDEX `ops_tokens_owner_idx` ON `ops_tokens` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `contacts_tenant_org_nr_idx` ON `contacts` (`tenant_id`,`org_nr`);--> statement-breakpoint
CREATE INDEX `contacts_tenant_company_idx` ON `contacts` (`tenant_id`,`company_id`);--> statement-breakpoint
CREATE INDEX `documents_credits_document_idx` ON `documents` (`credits_document_id`);