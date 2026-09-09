CREATE TABLE `bulletin_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_email` text NOT NULL,
	`target_name` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`archived_at` text,
	`archived_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bulletin_notes_active_created` ON `bulletin_notes` (`archived_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_bulletin_notes_author` ON `bulletin_notes` (`author_email`,`created_at`);
