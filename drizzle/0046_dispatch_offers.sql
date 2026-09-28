-- Distribuição de chamados por WhatsApp (lib/dispatch.ts, docs/DISPATCH_WHATSAPP.md).
-- Uma oferta por loja; o primeiro técnico que aceita fica com todos os FSAs dela.

CREATE TABLE `dispatch_offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_key` text NOT NULL,
	`store_name` text,
	`city` text,
	-- held (retida: falta dado ou técnico), open, assigned, expired, cancelled
	`status` text NOT NULL DEFAULT 'open',
	`hold_reasons` text,
	-- modo em que a oferta nasceu: dry_run não envia nada
	`mode` text NOT NULL,
	`assigned_technician_id` integer REFERENCES `technicians`(`id`),
	`assigned_at` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `idx_dispatch_offers_status` ON `dispatch_offers` (`status`, `expires_at`);

CREATE TABLE `dispatch_offer_tickets` (
	`offer_id` integer NOT NULL REFERENCES `dispatch_offers`(`id`),
	`ticket_key` text NOT NULL,
	-- 1 enquanto a oferta vale (aberta, retida ou atribuída); 0 quando expira ou é cancelada
	`active` integer NOT NULL DEFAULT 1,
	`equipment` text,
	`alleged_defect` text,
	PRIMARY KEY (`offer_id`, `ticket_key`)
);
-- O mesmo FSA não fica em duas ofertas valendo: retry do cron ou do Jira não duplica.
CREATE UNIQUE INDEX `idx_dispatch_offer_tickets_active` ON `dispatch_offer_tickets` (`ticket_key`) WHERE `active` = 1;

CREATE TABLE `dispatch_recipients` (
	`offer_id` integer NOT NULL REFERENCES `dispatch_offers`(`id`),
	`technician_id` integer NOT NULL REFERENCES `technicians`(`id`),
	`phone` text NOT NULL,
	`wamid` text,
	-- simulated, sent, delivered, read, failed, clicked
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY (`offer_id`, `technician_id`)
);
CREATE INDEX `idx_dispatch_recipients_wamid` ON `dispatch_recipients` (`wamid`);

CREATE TABLE `dispatch_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offer_id` integer NOT NULL REFERENCES `dispatch_offers`(`id`),
	`technician_id` integer,
	`kind` text NOT NULL,
	`details` text,
	`created_at` text NOT NULL
);
CREATE INDEX `idx_dispatch_events_offer` ON `dispatch_events` (`offer_id`, `created_at`);
