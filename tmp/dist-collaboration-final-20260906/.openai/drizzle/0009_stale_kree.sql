CREATE TABLE `operational_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_key` text NOT NULL,
	`action` text NOT NULL,
	`actor_email` text NOT NULL,
	`details` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_operational_audit_ticket` ON `operational_audit` (`ticket_key`,`created_at`);