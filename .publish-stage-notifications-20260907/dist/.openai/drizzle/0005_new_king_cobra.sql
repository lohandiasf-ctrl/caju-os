CREATE TABLE `technician_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technician_id` integer NOT NULL,
	`author_email` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_technician_reviews_technician` ON `technician_reviews` (`technician_id`,`created_at`);