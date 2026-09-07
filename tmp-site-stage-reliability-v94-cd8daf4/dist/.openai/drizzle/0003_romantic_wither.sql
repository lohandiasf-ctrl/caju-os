CREATE TABLE `finance_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`first_ticket_cents` integer DEFAULT 7000 NOT NULL,
	`additional_ticket_cents` integer DEFAULT 7000 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
