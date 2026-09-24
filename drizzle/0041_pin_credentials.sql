-- PIN de 4 dígitos como atalho de login (ver app/api/auth/pin/*,
-- lib/pin-device.ts). Uma linha por aparelho: sem o deviceSecret gerado
-- naquele aparelho, o PIN sozinho não bate com o hash guardado aqui.
CREATE TABLE `pin_credentials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`device_id` text NOT NULL,
	`label` text,
	`salt` text NOT NULL,
	`hash` text NOT NULL,
	`iterations` integer NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`created_at` text NOT NULL,
	`last_used_at` text
);

CREATE UNIQUE INDEX `idx_pin_credentials_device` ON `pin_credentials` (`device_id`);
CREATE INDEX `idx_pin_credentials_user_email` ON `pin_credentials` (`user_email`);
