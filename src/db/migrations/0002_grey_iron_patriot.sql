ALTER TABLE `jobs` MODIFY COLUMN `run_at` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` MODIFY COLUMN `locked_at` datetime(3);