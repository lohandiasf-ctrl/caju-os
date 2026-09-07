CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`client_name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_projects_name` ON `projects` (`name`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stores_project_code` ON `stores` (`project_id`,`code`);--> statement-breakpoint
CREATE INDEX `idx_stores_project_id` ON `stores` (`project_id`);--> statement-breakpoint
CREATE TABLE `technicians` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`base_city` text NOT NULL,
	`base_state` text NOT NULL,
	`status` text DEFAULT 'offline' NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_technicians_email` ON `technicians` (`email`);--> statement-breakpoint
CREATE INDEX `idx_technicians_status` ON `technicians` (`status`);--> statement-breakpoint
CREATE TABLE `ticket_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`actor_id` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_history_ticket_id` ON `ticket_history` (`ticket_id`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`project_id` integer NOT NULL,
	`store_id` integer NOT NULL,
	`technician_id` integer,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'triage' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`scheduled_at` text,
	`client_value_cents` integer,
	`technician_value_cents` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tickets_external_id` ON `tickets` (`external_id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_status_priority` ON `tickets` (`status`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_tickets_project_id` ON `tickets` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_technician_id` ON `tickets` (`technician_id`);