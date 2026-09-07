CREATE TABLE `operational_stores` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`requester_name` text,
	`requester_phone` text,
	`requester_role` text,
	`secondary_name` text,
	`secondary_phone` text,
	`secondary_role` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operational_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workflow_id` integer NOT NULL,
	`visit_number` integer NOT NULL,
	`technician_id` integer,
	`scheduled_at` text,
	`expected_return_at` text,
	`completed_at` text,
	`client_value_cents` integer,
	`payout_cents` integer,
	`status` text DEFAULT 'planned' NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `operational_workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operational_visits_order` ON `operational_visits` (`workflow_id`,`visit_number`);--> statement-breakpoint
CREATE INDEX `idx_operational_visits_workflow` ON `operational_visits` (`workflow_id`);--> statement-breakpoint
CREATE TABLE `operational_workflows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_key` text NOT NULL,
	`store_code` text,
	`store_name` text,
	`address` text,
	`city` text,
	`state` text,
	`opened_at` text,
	`category` text,
	`pdv_number` text,
	`description` text,
	`client_value_cents` integer,
	`payout_cents` integer,
	`status` text DEFAULT 'triage' NOT NULL,
	`technician_id` integer,
	`scheduled_at` text,
	`expected_return_at` text,
	`validation_status` text,
	`spare_source` text,
	`spare_status` text,
	`purchase_status` text,
	`parts_value_cents` integer,
	`parts_sale_cents` integer,
	`payment_date` text,
	`paid_value_cents` integer,
	`pix_key` text,
	`bank` text,
	`account_holder` text,
	`pix_key_type` text,
	`archived_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operational_workflows_ticket` ON `operational_workflows` (`ticket_key`);--> statement-breakpoint
CREATE INDEX `idx_operational_workflows_status` ON `operational_workflows` (`status`,`scheduled_at`);