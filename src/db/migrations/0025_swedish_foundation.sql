-- Swedish foundation (plan.md §5.1.5): the complete schema delta for the
-- Swedish edition, written in one migration even where the UI that fills a
-- column arrives in a later phase. Schema is not retrofitted.
--
-- What is deliberately NOT here: any rewrite of existing amounts. Amounts are
-- minor units *of the row's own currency*, so an inherited row that says
-- `currency = 'PYG'` still means whole guaraníes and still formats correctly.
-- Only the column defaults change, which affects rows created from now on.

-- Tenant currency and företagsuppgifter (plan.md §1.3, §2).
ALTER TABLE `tenants` ADD `currency` char(3) DEFAULT 'SEK' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tenants` ADD `org_nr` varchar(12);
--> statement-breakpoint
ALTER TABLE `tenants` ADD `moms_reg_nr` varchar(20);
--> statement-breakpoint
ALTER TABLE `tenants` ADD `bankgiro` varchar(20);
--> statement-breakpoint
ALTER TABLE `tenants` ADD `plusgiro` varchar(20);
--> statement-breakpoint
ALTER TABLE `tenants` ADD `f_skatt` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `tenants` ADD `payment_terms_days` int DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE `tenants` ADD `invoice_footer` text;
--> statement-breakpoint
ALTER TABLE `tenants` MODIFY COLUMN `locale` varchar(10) DEFAULT 'sv' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tenants` MODIFY COLUMN `timezone` varchar(60) DEFAULT 'Europe/Stockholm' NOT NULL;
--> statement-breakpoint

-- Currency defaults flip from PYG to SEK on every priced table (plan.md §1.3).
ALTER TABLE `deals` MODIFY COLUMN `currency` char(3) DEFAULT 'SEK' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `currency` char(3) DEFAULT 'SEK' NOT NULL;
--> statement-breakpoint
ALTER TABLE `quotes` MODIFY COLUMN `currency` char(3) DEFAULT 'SEK' NOT NULL;
--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `currency` char(3) DEFAULT 'SEK' NOT NULL;
--> statement-breakpoint
ALTER TABLE `document_payments` MODIFY COLUMN `currency` char(3) DEFAULT 'SEK' NOT NULL;
--> statement-breakpoint
ALTER TABLE `payments` MODIFY COLUMN `currency` char(3) DEFAULT 'SEK' NOT NULL;
--> statement-breakpoint

-- org.nr on contacts (plan.md §1.9).
ALTER TABLE `contacts` ADD `org_nr` varchar(12);
--> statement-breakpoint
CREATE INDEX `contacts_tenant_org_nr_idx` ON `contacts` (`tenant_id`,`org_nr`);
--> statement-breakpoint

-- Momssatser as configuration rows with a validity date and a source, never
-- as constants in code (plan.md §1.4, §4.11).
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
	CONSTRAINT `vat_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `vat_rates_tenant_id_idx` ON `vat_rates` (`tenant_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `vat_rates_tenant_rate_from_idx` ON `vat_rates` (`tenant_id`,`rate_bps`,`valid_from`);
--> statement-breakpoint

-- Seed the four Swedish rates for every existing tenant. New tenants get the
-- same set from createTenant, which is the path that matters from here on.
-- The ids are derived from the tenant id rather than generated, because SQL
-- has no ULID: 21 characters of the tenant's own id plus a per-rate suffix is
-- unique, stable, and re-runnable.
--
-- `valid_from` is a seed placeholder, NOT a statutory date — see the source
-- text on each row and KNOWN-ISSUES.md.
INSERT INTO `vat_rates` (`id`, `tenant_id`, `rate_bps`, `label`, `valid_from`, `source`, `is_default`)
SELECT CONCAT(LEFT(t.`id`, 21), 'V2500'), t.`id`, 2500, '25 %', '2000-01-01 00:00:00',
	'Seedad standardsats. Momssatserna anges i mervardesskattelagen; giltighetsdatumet ar ett seed-varde, inte ett lagstadgat datum. Verifiera aktuell sats hos Skatteverket.',
	true
FROM `tenants` t;
--> statement-breakpoint
INSERT INTO `vat_rates` (`id`, `tenant_id`, `rate_bps`, `label`, `valid_from`, `source`, `is_default`)
SELECT CONCAT(LEFT(t.`id`, 21), 'V1200'), t.`id`, 1200, '12 % (livsmedel, hotell, restaurang)', '2000-01-01 00:00:00',
	'Seedad reducerad sats. Verifiera aktuell sats och vilka varor/tjanster den omfattar hos Skatteverket.',
	false
FROM `tenants` t;
--> statement-breakpoint
INSERT INTO `vat_rates` (`id`, `tenant_id`, `rate_bps`, `label`, `valid_from`, `source`, `is_default`)
SELECT CONCAT(LEFT(t.`id`, 21), 'V0600'), t.`id`, 600, '6 % (bocker, persontransport, kultur)', '2000-01-01 00:00:00',
	'Seedad reducerad sats. Verifiera aktuell sats och vilka varor/tjanster den omfattar hos Skatteverket.',
	false
FROM `tenants` t;
--> statement-breakpoint
INSERT INTO `vat_rates` (`id`, `tenant_id`, `rate_bps`, `label`, `valid_from`, `source`, `is_default`)
SELECT CONCAT(LEFT(t.`id`, 21), 'V0000'), t.`id`, 0, '0 % (momsfritt/undantaget)', '2000-01-01 00:00:00',
	'Seedad nollsats for undantagen omsattning (vard, tandvard, utbildning m.fl.). Verifiera undantaget hos Skatteverket innan det anvands.',
	false
FROM `tenants` t;
--> statement-breakpoint

-- Moms per line, everywhere a price is stored (plan.md §1.4). Nullable until
-- O2 activates the engine that writes them.
ALTER TABLE `products` ADD `vat_rate_bps` int;
--> statement-breakpoint
ALTER TABLE `quote_items` ADD `vat_rate_bps` int;
--> statement-breakpoint
ALTER TABLE `quote_items` ADD `vat_amount` bigint;
--> statement-breakpoint
ALTER TABLE `document_items` ADD `vat_rate_bps` int;
--> statement-breakpoint
ALTER TABLE `document_items` ADD `vat_amount` bigint;
--> statement-breakpoint

-- Faktura & kreditfaktura (plan.md §1.5, §1.6).
ALTER TABLE `documents` ADD `vat_total` bigint;
--> statement-breakpoint
ALTER TABLE `documents` ADD `vat_summary` json;
--> statement-breakpoint
ALTER TABLE `documents` ADD `delivery_date` datetime;
--> statement-breakpoint
ALTER TABLE `documents` ADD `ocr_number` varchar(30);
--> statement-breakpoint
ALTER TABLE `documents` ADD `credits_document_id` char(26);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_tenant_ocr_idx` ON `documents` (`tenant_id`,`ocr_number`);
--> statement-breakpoint
CREATE INDEX `documents_credits_document_idx` ON `documents` (`credits_document_id`);
--> statement-breakpoint

-- `type` is a varchar with a drizzle-level enum, not a MySQL ENUM, so the
-- value change is data only. Every inherited nota de venta is what a Swedish
-- tenant would call a faktura.
ALTER TABLE `documents` MODIFY COLUMN `type` varchar(20) DEFAULT 'faktura' NOT NULL;
--> statement-breakpoint
UPDATE `documents` SET `type` = 'faktura' WHERE `type` = 'nota_venta';
--> statement-breakpoint
UPDATE `document_sequences` SET `doc_type` = 'faktura' WHERE `doc_type` = 'nota_venta';
--> statement-breakpoint

-- Sequence prefixes become Swedish for tenants created from here on
-- (plan.md §1.13). Existing rows keep the prefix their already-issued numbers
-- carry: a series that has printed NV-000001 must not silently become
-- FA-000001, because a number series may never be re-used or renumbered.
ALTER TABLE `document_sequences` MODIFY COLUMN `prefix` varchar(10) DEFAULT 'FA' NOT NULL;
--> statement-breakpoint
ALTER TABLE `quote_sequences` MODIFY COLUMN `prefix` varchar(10) DEFAULT 'OFF' NOT NULL;
