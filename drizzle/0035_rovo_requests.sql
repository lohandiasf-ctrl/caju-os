-- Ponte com o Rovo: a pergunta espera aqui entre a ida ao Jira Automation e a
-- volta pelo callback.
CREATE TABLE `rovo_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`ticket_key` text,
	`asked_by` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`answer` text,
	`error` text,
	`action_id` text,
	`created_at` text NOT NULL,
	`answered_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_rovo_requests_asked_by` ON `rovo_requests` (`asked_by`,`created_at`);
