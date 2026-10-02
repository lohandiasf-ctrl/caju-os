-- Retrato diário da fila de chamados, para comparar a Visão geral com qualquer
-- período (ontem, semana passada, mês passado, ano passado ou uma data escolhida).
-- Gravado pela rotina agendada a cada 10 min; o último valor do dia fica.
CREATE TABLE `daily_kpis` (
	`day` text PRIMARY KEY NOT NULL,
	`open` integer NOT NULL,
	`pending_schedule` integer NOT NULL,
	`scheduled` integer NOT NULL,
	`directed` integer NOT NULL,
	`awaiting_spare` integer NOT NULL,
	`in_field` integer NOT NULL,
	`with_technician` integer NOT NULL,
	`captured_at` text NOT NULL
);
