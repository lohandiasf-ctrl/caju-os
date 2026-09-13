ALTER TABLE `active_attendances` ADD `whatsapp_group_name` text;--> statement-breakpoint
ALTER TABLE `active_attendances` ADD `group_value_cents` integer;--> statement-breakpoint
ALTER TABLE `operational_workflows` ADD `scheduled_by_email` text;