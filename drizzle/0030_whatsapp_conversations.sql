CREATE TABLE `whatsapp_conversations` (
	`contact_phone` text PRIMARY KEY NOT NULL,
	`contact_name` text,
	`ticket_key` text,
	`assigned_to` text,
	`last_message_at` text NOT NULL,
	`last_read_at` text,
	`last_read_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
ALTER TABLE `whatsapp_messages` ADD `sender_email` text;
