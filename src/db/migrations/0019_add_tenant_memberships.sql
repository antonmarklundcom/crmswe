CREATE TABLE `tenant_memberships` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`role` varchar(20) NOT NULL,
	`banned` boolean NOT NULL DEFAULT false,
	`ban_reason` varchar(500),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_memberships_tenant_user_idx` UNIQUE(`tenant_id`,`user_id`)
);
--> statement-breakpoint
CREATE INDEX `tenant_memberships_user_id_idx` ON `tenant_memberships` (`user_id`);--> statement-breakpoint
-- Backfill: every user currently bound to a tenant keeps exactly the access
-- they have today, as a membership. Each such user has at most one membership
-- to create (one `users.tenant_id`), so reusing their own char(26) id as the
-- membership id is unique by construction and makes this re-runnable.
INSERT IGNORE INTO `tenant_memberships`
	(`id`, `tenant_id`, `user_id`, `role`, `banned`, `ban_reason`, `created_at`, `updated_at`)
SELECT `id`, `tenant_id`, `id`, `role`, `banned`, `ban_reason`, `created_at`, `updated_at`
FROM `users`
WHERE `tenant_id` IS NOT NULL AND `role` IN ('admin', 'agent');
--> statement-breakpoint
-- Deactivation was always a *tenant* decision wearing a platform column: the
-- only writer of `users.banned` for a tenant user is H4's "desactivar" button.
-- Now that the membership carries it, clear it here, or the flag would follow
-- the person into every business they are later added to. Superadmins
-- (`tenant_id IS NULL`) are untouched — theirs is a genuine platform ban.
UPDATE `users` SET `banned` = false, `ban_reason` = NULL, `ban_expires` = NULL
WHERE `tenant_id` IS NOT NULL AND `banned` = true;
