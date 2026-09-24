-- Guarda o id do anexo no Jira junto de cada evidência (foto/vídeo/RAT do N1),
-- para remover dos dois lados junto (app/api/n1-tickets/[key]/route.ts).
ALTER TABLE `ticket_evidence` ADD `jira_attachment_id` text;
