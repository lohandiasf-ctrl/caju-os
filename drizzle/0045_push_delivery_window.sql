-- Janela de entrega dos avisos push (lib/push-alerts.ts): dias da semana e
-- horário em que os avisos podem chegar, por pessoa. JSON
-- {enabled, days[0-6], start "HH:MM", end "HH:MM"}; nulo = sem janela.
ALTER TABLE `push_preferences` ADD `schedule` text;
