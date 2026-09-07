CREATE TABLE `app_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firebase_uid` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_users_firebase_uid` ON `app_users` (`firebase_uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_users_email` ON `app_users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_app_users_role_active` ON `app_users` (`role`,`active`);--> statement-breakpoint
INSERT INTO `app_users` (`firebase_uid`, `email`, `role`, `active`, `created_at`, `updated_at`) VALUES
  ('3L6ykGm3qKcygnvcxpg4VtdCUOc2', 'lohandiasf@gmail.com', 'gerencia', 1, datetime('now'), datetime('now')),
  ('fP5iQG3mKlfQ8PQ1HFiTsgrOWnF2', 'jrisraelbrito@gmail.com', 'n1', 1, datetime('now'), datetime('now')),
  ('CkLWwa3dIeNZHscP1BAWmNAfRRG2', 'sgenilson059@gmail.com', 'n1', 1, datetime('now'), datetime('now')),
  ('PNpE0eZRTEYxJ7GSBegSEeGBVpM2', 'aiapuridadeultimate@gmail.com', 'analista', 1, datetime('now'), datetime('now')),
  ('3wodjMrlLkb2zDDvzw8f7Z6F31j2', 'bellopes090392@gmail.com', 'analista', 1, datetime('now'), datetime('now'));
