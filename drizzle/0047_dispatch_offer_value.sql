-- Valor da oferta digitado pelo funcionário (oferta manual pela tela do chamado).
-- Vazio = padrão ("a combinar com a equipe"). Só aparece para o técnico na
-- versão do modelo com o valor como campo (oferta_valor*, lib/dispatch.ts).
ALTER TABLE `dispatch_offers` ADD `value_text` text;
