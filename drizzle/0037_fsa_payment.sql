-- Repasse ao técnico por FSA.
--
-- A classificação (serviço, evidência, improdutivo) existe só aqui: o Jira é a
-- origem do chamado e não conhece esses conceitos, e nada desta tabela volta
-- para lá. Por isso a chave é a do ticket — cada FSA tem uma classificação só.
CREATE TABLE IF NOT EXISTS `fsa_classifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_key` text NOT NULL,
	`attendance_id` integer,
	`tipo` text NOT NULL,
	`improdutiva` integer DEFAULT false NOT NULL,
	`motivo` text,
	`observacao` text,
	`descoberta_na_loja` integer DEFAULT false NOT NULL,
	`revisao` text DEFAULT 'ok' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`attendance_id`) REFERENCES `active_attendances`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_fsa_classifications_ticket` ON `fsa_classifications` (`ticket_key`);
CREATE INDEX IF NOT EXISTS `idx_fsa_classifications_attendance` ON `fsa_classifications` (`attendance_id`);

-- Fotografia do repasse fechado de uma visita.
--
-- O valor não é a fonte da verdade: ele sempre sai do cálculo sobre as FSAs
-- atuais. O que se guarda aqui é o que foi apresentado à gerência, para que uma
-- reclassificação posterior não reescreva à revelia o que já foi aprovado ou
-- pago. Uma visita por linha, porque a faixa de preço é do conjunto.
CREATE TABLE IF NOT EXISTS `fsa_payouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attendance_id` integer NOT NULL,
	`status` text DEFAULT 'aberto' NOT NULL,
	`servicos_cents` integer DEFAULT 0 NOT NULL,
	`evidencias_cents` integer DEFAULT 0 NOT NULL,
	`desconto_improdutivo_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`memoria` text,
	`approved_by` text,
	`approved_at` text,
	`paid_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`attendance_id`) REFERENCES `active_attendances`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_fsa_payouts_attendance` ON `fsa_payouts` (`attendance_id`);
