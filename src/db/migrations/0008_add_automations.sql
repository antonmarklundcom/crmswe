CREATE TABLE `flow_run_steps` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`run_id` char(26) NOT NULL,
	`node_id` varchar(100) NOT NULL,
	`node_type` varchar(40) NOT NULL,
	`status` varchar(20) NOT NULL,
	`result` json NOT NULL DEFAULT ('{}'),
	`executed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `flow_run_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flow_runs` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`flow_id` char(26) NOT NULL,
	`flow_version_id` char(26) NOT NULL,
	`contact_id` char(26) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'running',
	`current_node_id` varchar(100),
	`wait_until` datetime,
	`wait_for` varchar(10),
	`context` json NOT NULL DEFAULT ('{}'),
	`started_by` json NOT NULL DEFAULT ('{}'),
	`step_count` int NOT NULL DEFAULT 0,
	`last_error` varchar(2000),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `flow_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flow_versions` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`flow_id` char(26) NOT NULL,
	`version` int NOT NULL,
	`graph` json NOT NULL DEFAULT ('{}'),
	`published_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `flow_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `flow_versions_flow_version_idx` UNIQUE(`flow_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `flows` (
	`id` char(26) NOT NULL,
	`tenant_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`trigger_type` varchar(40) NOT NULL,
	`trigger_config` json NOT NULL DEFAULT ('{}'),
	`published_version_id` char(26),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `flows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `flow_run_steps_tenant_id_idx` ON `flow_run_steps` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `flow_run_steps_run_id_idx` ON `flow_run_steps` (`run_id`);--> statement-breakpoint
CREATE INDEX `flow_runs_tenant_id_idx` ON `flow_runs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `flow_runs_flow_contact_idx` ON `flow_runs` (`flow_id`,`contact_id`,`status`);--> statement-breakpoint
CREATE INDEX `flow_runs_tenant_contact_status_idx` ON `flow_runs` (`tenant_id`,`contact_id`,`status`);--> statement-breakpoint
CREATE INDEX `flow_versions_tenant_id_idx` ON `flow_versions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `flows_tenant_id_idx` ON `flows` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `flows_tenant_trigger_idx` ON `flows` (`tenant_id`,`trigger_type`,`status`);