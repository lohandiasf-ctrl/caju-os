CREATE TABLE `geocode_cache` (
	`query` text PRIMARY KEY NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL
);
