CREATE TABLE `chat_group_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`email` text NOT NULL,
	`member_role` text DEFAULT 'member' NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `chat_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_group_members_group_email` ON `chat_group_members` (`group_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_chat_group_members_email` ON `chat_group_members` (`email`,`group_id`);--> statement-breakpoint
CREATE TABLE `chat_group_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`sender_email` text NOT NULL,
	`body` text NOT NULL,
	`ticket_id` text,
	`attachment_name` text,
	`attachment_type` text,
	`attachment_data` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `chat_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chat_group_messages_group_created` ON `chat_group_messages` (`group_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_group_reads` (
	`group_id` integer NOT NULL,
	`email` text NOT NULL,
	`last_read_message_id` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `chat_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_group_reads_group_email` ON `chat_group_reads` (`group_id`,`email`);--> statement-breakpoint
CREATE TABLE `chat_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_typing` (
	`conversation_key` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_typing_conversation_email` ON `chat_typing` (`conversation_key`,`email`);--> statement-breakpoint
CREATE TABLE `communication_preferences` (
	`email` text PRIMARY KEY NOT NULL,
	`desktop_messages` integer DEFAULT true NOT NULL,
	`desktop_calls` integer DEFAULT true NOT NULL,
	`sound_messages` integer DEFAULT true NOT NULL,
	`sound_calls` integer DEFAULT true NOT NULL,
	`quiet_hours_enabled` integer DEFAULT false NOT NULL,
	`quiet_hours_start` text DEFAULT '20:00' NOT NULL,
	`quiet_hours_end` text DEFAULT '07:00' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voice_call_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`direction` text NOT NULL,
	`kind` text NOT NULL,
	`peer_names` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`duration_seconds` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_voice_call_history_session_owner` ON `voice_call_history` (`session_id`,`owner_email`);--> statement-breakpoint
CREATE INDEX `idx_voice_call_history_owner_started` ON `voice_call_history` (`owner_email`,`started_at`);--> statement-breakpoint
ALTER TABLE `employee_messages` ADD `delivered_at` text;--> statement-breakpoint
ALTER TABLE `employee_presence` ADD `manual_status` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_presence` ADD `last_seen_at` text;