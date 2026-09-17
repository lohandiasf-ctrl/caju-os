-- Trilha de auditoria da escrita assistida: toda proposta do assistente
-- (ou da ponte com o Rovo), confirmada ou não, fica registrada aqui.
CREATE TABLE `assistant_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`description` text NOT NULL,
	`source` text DEFAULT 'assistant' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`proposed_to` text NOT NULL,
	`confirmed_by` text,
	`error` text,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_assistant_actions_created` ON `assistant_actions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_assistant_actions_ticket` ON `assistant_actions` (`ticket_key`,`created_at`);
