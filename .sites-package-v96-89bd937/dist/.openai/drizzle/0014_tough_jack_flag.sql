CREATE TABLE `employee_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`event` text NOT NULL,
	`context` text,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_employee_activity_email_created` ON `employee_activity` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `operational_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_key` text,
	`title` text NOT NULL,
	`assigned_to` text,
	`accepted_by` text,
	`status` text DEFAULT 'open' NOT NULL,
	`progress_note` text,
	`next_check_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_operational_tasks_assignee` ON `operational_tasks` (`assigned_to`,`status`,`next_check_at`);--> statement-breakpoint
CREATE INDEX `idx_operational_tasks_ticket` ON `operational_tasks` (`ticket_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `requester_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_key` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`phone` text,
	`recorded_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_requester_history_ticket` ON `requester_history` (`ticket_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `shipment_tracking` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_key` text NOT NULL,
	`source` text NOT NULL,
	`tracking_code` text NOT NULL,
	`carrier` text,
	`status` text DEFAULT 'Postado' NOT NULL,
	`expected_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shipment_tracking_code` ON `shipment_tracking` (`ticket_key`,`tracking_code`);--> statement-breakpoint
CREATE INDEX `idx_shipment_tracking_ticket` ON `shipment_tracking` (`ticket_key`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ticket_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_key` text NOT NULL,
	`actor_email` text NOT NULL,
	`reason` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_snapshots_ticket` ON `ticket_snapshots` (`ticket_key`,`created_at`);