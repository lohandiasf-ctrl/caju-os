CREATE TABLE `parts_catalog` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sale_price_cents` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_parts_catalog_name` ON `parts_catalog` (`name`);