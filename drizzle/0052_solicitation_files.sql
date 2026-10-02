-- Anexos das solicitações (foto, print da conversa, PDF). Guardados como data URL, como as
-- evidências dos chamados: o servidor confere o tipo pela assinatura do arquivo.
CREATE TABLE `solicitation_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`solicitation_id` integer NOT NULL REFERENCES `solicitations`(`id`),
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`data` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL
);
CREATE INDEX `idx_solicitation_files` ON `solicitation_files` (`solicitation_id`, `created_at`);
