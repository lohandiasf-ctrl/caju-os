-- Conversas fixadas no topo da caixa do WhatsApp. Pessoal: cada funcionário fixa
-- as suas, e vale no computador e no celular.
CREATE TABLE `whatsapp_conversation_pins` (
	`email` text NOT NULL,
	`account` text NOT NULL,
	`contact_phone` text NOT NULL,
	`pinned_at` text NOT NULL,
	PRIMARY KEY (`email`, `account`, `contact_phone`)
);
