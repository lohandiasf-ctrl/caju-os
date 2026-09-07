CREATE TABLE `employee_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sender_email` text NOT NULL,
	`recipient_email` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_employee_messages_sender_recipient` ON `employee_messages` (`sender_email`,`recipient_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_employee_messages_recipient_read` ON `employee_messages` (`recipient_email`,`read_at`);--> statement-breakpoint
CREATE TABLE `employee_presence` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`phone` text,
	`photo_url` text,
	`status` text DEFAULT 'Online' NOT NULL,
	`updated_at` text NOT NULL
);
