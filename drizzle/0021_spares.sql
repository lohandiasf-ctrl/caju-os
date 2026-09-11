CREATE TABLE `spares` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_key` text NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	`ticket_key` text NOT NULL,
	`city` text NOT NULL,
	`equipment` text NOT NULL,
	`tracking_code` text,
	`expected_delivery` text,
	`technician` text,
	`expected_service` text,
	`note` text,
	`address` text,
	`supplier` text NOT NULL,
	`source` text DEFAULT 'system' NOT NULL,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`sync_error` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_spares_external_key` ON `spares` (`external_key`);--> statement-breakpoint
CREATE INDEX `idx_spares_status_updated` ON `spares` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_spares_ticket` ON `spares` (`ticket_key`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_spares_sync` ON `spares` (`sync_status`,`updated_at`);
