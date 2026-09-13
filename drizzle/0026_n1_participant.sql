ALTER TABLE `n1_ticket_assignments` ADD `participant_n1_email` text;
--> statement-breakpoint
ALTER TABLE `n1_ticket_assignments` ADD `participant_claimed_at` text;
--> statement-breakpoint
CREATE INDEX `idx_n1_ticket_assignments_participant` ON `n1_ticket_assignments` (`participant_n1_email`);

