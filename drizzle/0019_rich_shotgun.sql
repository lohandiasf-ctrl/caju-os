CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_email` text NOT NULL,
	`kind` text DEFAULT 'sugestao' NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'aberto' NOT NULL,
	`handled_by` text,
	`handled_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_status_created` ON `feedback` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_feedback_author` ON `feedback` (`author_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `feedback_votes` (
	`feedback_id` integer NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`feedback_id`) REFERENCES `feedback`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feedback_votes_unique` ON `feedback_votes` (`feedback_id`,`email`);