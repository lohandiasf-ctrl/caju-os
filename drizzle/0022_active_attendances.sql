CREATE TABLE `active_attendances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`ended_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_active_attendances_open_started` ON `active_attendances` (`ended_at`,`started_at`);
--> statement-breakpoint
CREATE INDEX `idx_active_attendances_owner_started` ON `active_attendances` (`owner_email`,`started_at`);
--> statement-breakpoint
CREATE TABLE `active_attendance_tickets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attendance_id` integer NOT NULL,
	`ticket_key` text NOT NULL,
	`summary` text NOT NULL,
	`store` text,
	`city` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`attendance_id`) REFERENCES `active_attendances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_active_attendance_ticket_unique` ON `active_attendance_tickets` (`attendance_id`,`ticket_key`);
--> statement-breakpoint
CREATE INDEX `idx_active_attendance_tickets_key` ON `active_attendance_tickets` (`ticket_key`);
