CREATE TABLE `jira_issue_links` (
	`issue_key` text PRIMARY KEY NOT NULL,
	`whatsapp_url` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
