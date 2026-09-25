-- Avisos push escolhíveis (lib/push-alerts.ts). push_preferences guarda,
-- por e-mail, quais tipos a pessoa quer (JSON {tipo: boolean}; o que faltar
-- usa o padrão). push_alerts_sent é o controle dos avisos da fila já
-- enviados: um por chamado e situação, apagado depois de 30 dias.
CREATE TABLE `push_preferences` (
	`email` text PRIMARY KEY NOT NULL,
	`kinds` text NOT NULL,
	`updated_at` text NOT NULL
);

CREATE TABLE `push_alerts_sent` (
	`dedupe` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`ticket_key` text NOT NULL,
	`sent_at` text NOT NULL
);

CREATE INDEX `idx_push_alerts_sent_at` ON `push_alerts_sent` (`sent_at`);
