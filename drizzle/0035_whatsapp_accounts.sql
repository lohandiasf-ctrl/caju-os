-- Segunda conta de WhatsApp ("Whatsapp Caju").
--
-- Até aqui havia um número só e nada dizia de qual conta era cada conversa.
-- Com duas, isso passa a importar: sem a coluna, uma resposta poderia sair
-- pelo número errado.
--
-- Tudo que já existe fica com 'principal', que é o número atual.
ALTER TABLE `whatsapp_conversations` ADD `account` text NOT NULL DEFAULT 'principal';
ALTER TABLE `whatsapp_messages` ADD `account` text NOT NULL DEFAULT 'principal';

-- A caixa de entrada lista por conta e por data.
CREATE INDEX IF NOT EXISTS `idx_whatsapp_conversations_account` ON `whatsapp_conversations` (`account`, `last_message_at`);
CREATE INDEX IF NOT EXISTS `idx_whatsapp_messages_account_occurred` ON `whatsapp_messages` (`account`, `occurred_at`);
