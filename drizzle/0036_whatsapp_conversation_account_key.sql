-- A conversa passa a ser identificada por conta + contato.
--
-- Com dois números, a chave só pelo telefone colide: o mesmo contato falando
-- com os dois viraria uma conversa só, e a segunda sobrescreveria a conta da
-- primeira. São conversas diferentes, cada uma com seu histórico.
--
-- SQLite não altera chave primária, então a tabela é recriada. São poucas
-- linhas, e o conteúdo vem inteiro do original.
CREATE TABLE `whatsapp_conversations_new` (
	`contact_phone` text NOT NULL,
	`contact_name` text,
	`phone_jid` text,
	`ticket_key` text,
	`assigned_to` text,
	`last_message_at` text NOT NULL,
	`last_read_at` text,
	`last_read_by` text,
	`account` text NOT NULL DEFAULT 'principal',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY (`account`, `contact_phone`)
);

INSERT INTO `whatsapp_conversations_new`
  (`contact_phone`, `contact_name`, `phone_jid`, `ticket_key`, `assigned_to`, `last_message_at`, `last_read_at`, `last_read_by`, `account`, `created_at`, `updated_at`)
SELECT `contact_phone`, `contact_name`, `phone_jid`, `ticket_key`, `assigned_to`, `last_message_at`, `last_read_at`, `last_read_by`, `account`, `created_at`, `updated_at`
FROM `whatsapp_conversations`;

DROP TABLE `whatsapp_conversations`;
ALTER TABLE `whatsapp_conversations_new` RENAME TO `whatsapp_conversations`;

CREATE INDEX IF NOT EXISTS `idx_whatsapp_conversations_account` ON `whatsapp_conversations` (`account`, `last_message_at`);
