-- Data a partir da qual o painel financeiro conta.
--
-- A gerência quer conferir os números 1:1 contra o que foi aprovado nos grupos
-- de repasse, e isso só funciona começando do zero. Os valores vêm do Jira e dos
-- grupos — apagar não é opção, nem seria bom. Em vez disso o painel ignora o que
-- veio antes desta data, e dá para voltar atrás mudando a data.
ALTER TABLE `finance_settings` ADD `acompanhamento_desde` text;
