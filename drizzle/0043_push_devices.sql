-- Aparelhos do app Caju OS no celular que recebem notificação push (ver
-- lib/server/push.ts e app/api/push/devices). Um token por aparelho; o mesmo
-- aparelho que troca de conta passa a apontar para o novo e-mail. Token que o
-- serviço do Expo diz não existir mais fica com disabled_at.
CREATE TABLE `push_devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`token` text NOT NULL,
	`platform` text NOT NULL,
	`device_name` text,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`disabled_at` text
);

CREATE UNIQUE INDEX `idx_push_devices_token` ON `push_devices` (`token`);
CREATE INDEX `idx_push_devices_user_email` ON `push_devices` (`user_email`);
