-- Solicitações da gerência para clientes que não estão no Jira (qualquer cliente):
-- a equipe assume, escolhe o técnico da cidade, define o dia, cria o grupo no
-- WhatsApp e devolve o resumo ao solicitante pelo WhatsApp. Sem prazo.
CREATE TABLE `solicitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requester_email` text NOT NULL,
	`requester_phone` text NOT NULL,
	`client` text NOT NULL,
	`city` text NOT NULL,
	`uf` text,
	`store` text,
	`address` text,
	`description` text NOT NULL,
	`priority` text NOT NULL DEFAULT 'normal',
	`assignee_email` text,
	`technician_id` integer REFERENCES `technicians`(`id`),
	`scheduled_at` text,
	`group_jid` text,
	`group_name` text,
	`returned_at` text,
	`cancelled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `idx_solicitations_open` ON `solicitations` (`returned_at`, `cancelled_at`, `created_at`);

CREATE TABLE `solicitation_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`solicitation_id` integer NOT NULL REFERENCES `solicitations`(`id`),
	`kind` text NOT NULL,
	`actor_email` text NOT NULL,
	`details` text,
	`created_at` text NOT NULL
);
CREATE INDEX `idx_solicitation_events` ON `solicitation_events` (`solicitation_id`, `created_at`);
