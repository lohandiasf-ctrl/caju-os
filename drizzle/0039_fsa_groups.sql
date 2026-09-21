-- O grupo passa a ser a unidade de pagamento.
--
-- Antes a classificação era única por chamado e presa ao atendimento preparado
-- da operação ao vivo. Dois problemas: não dava para classificar sem preparar um
-- atendimento, e um chamado que volta para a fila (vira "aguardando spare", o
-- spare chega, outro técnico atende) sobrescrevia a passada anterior, apagando
-- um trabalho que já aconteceu e já tinha sido pago.
--
-- Agora o grupo nasce da seleção de chamados, carrega o técnico e o dia, e é ele
-- que define a faixa de preço. Um chamado pode estar em vários grupos ao longo
-- do tempo, um por passada.
--
-- As duas tabelas antigas estavam vazias, então não há o que converter.
DROP TABLE IF EXISTS `fsa_classifications`;
DROP TABLE IF EXISTS `fsa_payouts`;

CREATE TABLE `fsa_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text,
	`technician_id` integer NOT NULL,
	`dia` text NOT NULL,
	`status` text DEFAULT 'aberto' NOT NULL,
	`servicos_cents` integer DEFAULT 0 NOT NULL,
	`evidencias_cents` integer DEFAULT 0 NOT NULL,
	`improdutivas_cents` integer DEFAULT 0 NOT NULL,
	`desconto_improdutivo_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`memoria` text,
	`approved_by` text,
	`approved_at` text,
	`paid_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `idx_fsa_groups_status` ON `fsa_groups` (`status`,`dia`);
CREATE INDEX `idx_fsa_groups_tecnico` ON `fsa_groups` (`technician_id`,`dia`);

CREATE TABLE `fsa_classifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`ticket_key` text NOT NULL,
	`summary` text,
	`store` text,
	`tipo` text,
	`improdutiva` integer DEFAULT false NOT NULL,
	`motivo` text,
	`observacao` text,
	`descoberta_na_loja` integer DEFAULT false NOT NULL,
	`revisao` text DEFAULT 'ok' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `fsa_groups`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `idx_fsa_classifications_grupo` ON `fsa_classifications` (`group_id`,`ticket_key`);
CREATE INDEX `idx_fsa_classifications_ticket` ON `fsa_classifications` (`ticket_key`);
