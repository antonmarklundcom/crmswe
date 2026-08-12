CREATE TABLE `site_api_keys` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`site_id` char(26) NOT NULL,
	`api_key_hash` char(64) NOT NULL,
	`api_key_prefix` varchar(16) NOT NULL,
	`label` varchar(100),
	`last_used_at` datetime,
	`revoked_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `site_api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_api_keys_hash_idx` UNIQUE(`api_key_hash`)
);
--> statement-breakpoint
ALTER TABLE `sites` DROP INDEX `sites_api_key_hash_idx`;--> statement-breakpoint
CREATE INDEX `site_api_keys_tenant_id_idx` ON `site_api_keys` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `site_api_keys_site_id_idx` ON `site_api_keys` (`site_id`);--> statement-breakpoint
-- Backfill (PLAN.md §5.2): every existing site's key moves into the new
-- table BEFORE the old columns are dropped, so no site loses the key its
-- production form handler is already deployed with. The new row reuses the
-- site's own ULID as its id — ids only have to be unique within
-- site_api_keys, there is exactly one row per site here, and a deterministic
-- value keeps this migration re-runnable against a restored dump.
INSERT INTO `site_api_keys` (`id`, `tenant_id`, `site_id`, `api_key_hash`, `api_key_prefix`, `label`, `created_at`, `updated_at`)
SELECT `id`, `tenant_id`, `id`, `api_key_hash`, `api_key_prefix`, 'inicial', `created_at`, `created_at` FROM `sites`;
--> statement-breakpoint
ALTER TABLE `sites` DROP COLUMN `api_key_hash`;--> statement-breakpoint
ALTER TABLE `sites` DROP COLUMN `api_key_prefix`;