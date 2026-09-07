CREATE TABLE `jira_sync_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issue_key` text NOT NULL,
	`operation` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`actor_email` text NOT NULL,
	`last_error` text,
	`next_attempt_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_jira_sync_jobs_idempotency` ON `jira_sync_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_jira_sync_jobs_status_next` ON `jira_sync_jobs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `idx_jira_sync_jobs_issue` ON `jira_sync_jobs` (`issue_key`,`created_at`);