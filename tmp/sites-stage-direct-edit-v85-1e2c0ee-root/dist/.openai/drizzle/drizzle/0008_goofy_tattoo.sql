CREATE TABLE `n1_ticket_assignments` (
	`ticket_key` text PRIMARY KEY NOT NULL,
	`n1_email` text NOT NULL,
	`status` text DEFAULT 'claimed' NOT NULL,
	`claimed_at` text NOT NULL,
	`validated_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ticket_evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_key` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`data` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_evidence_ticket` ON `ticket_evidence` (`ticket_key`,`created_at`);