CREATE TABLE `ticket_archives` (
  `ticket_key` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `jira_status` text,
  `operational_status` text,
  `store_name` text,
  `city` text,
  `snapshot` text NOT NULL,
  `captured_at` text NOT NULL,
  `captured_by` text NOT NULL,
  `capture_reason` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_archives_captured_at` ON `ticket_archives` (`captured_at`);
--> statement-breakpoint
CREATE INDEX `idx_ticket_archives_status` ON `ticket_archives` (`operational_status`,`captured_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO `ticket_archives` (
  `ticket_key`, `title`, `jira_status`, `operational_status`, `store_name`, `city`,
  `snapshot`, `captured_at`, `captured_by`, `capture_reason`, `created_at`, `updated_at`
)
SELECT
  `ticket_key`,
  COALESCE(NULLIF(`store_name`, ''), `ticket_key`),
  NULL,
  `status`,
  `store_name`,
  `city`,
  '{"source":"operational_workflows","note":"Registro migrado para o histórico permanente."}',
  COALESCE(`archived_at`, `updated_at`),
  `created_by`,
  'Registro operacional existente migrado',
  `created_at`,
  `updated_at`
FROM `operational_workflows`;
