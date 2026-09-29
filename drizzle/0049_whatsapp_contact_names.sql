-- Agenda de contatos da operação (nome como a equipe conhece). Tem prioridade
-- sobre o nome que a pessoa escolheu no perfil do WhatsApp. `phone_key` é
-- DDD + os 8 últimos dígitos, para casar com ou sem o nono dígito.
CREATE TABLE `whatsapp_contact_names` (
	`phone_key` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`name` text NOT NULL,
	`source` text,
	`updated_at` text NOT NULL
);
