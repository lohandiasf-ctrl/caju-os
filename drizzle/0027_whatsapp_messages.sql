CREATE TABLE `whatsapp_messages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `wamid` text NOT NULL,
  `phone_number_id` text NOT NULL,
  `contact_phone` text,
  `contact_name` text,
  `direction` text NOT NULL,
  `message_type` text NOT NULL,
  `body` text,
  `media_id` text,
  `delivery_status` text,
  `occurred_at` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whatsapp_messages_wamid` ON `whatsapp_messages` (`wamid`);
--> statement-breakpoint
CREATE INDEX `idx_whatsapp_messages_contact_occurred` ON `whatsapp_messages` (`contact_phone`,`occurred_at`);
