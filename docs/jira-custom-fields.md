# Catálogo de campos personalizados do Jira

Referência fornecida em 06/09/2026 para a integração Delfia/Caju OS. Não contém credenciais. Antes de usar um campo `Select`, `UserPicker`, `Assets` ou `CascadingSelect`, consulte as opções/metadados permitidos pelo tipo de chamado.

## Técnicos e pessoas

| Campo | ID | Tipo na API |
|---|---|---|
| Dados dos técnicos | `customfield_12279` | TextArea (ADF) |
| Nome do Técnico | `customfield_12316` | TextField (String) |
| Telefone do Técnico | `customfield_16237` | TextField (String) |
| RG | `customfield_11956` | TextField (String) |
| CPF/CNPJ (Técnico) | `customfield_16238` | TextField (String) |
| Número Contato | `customfield_11963` | TextField (String) |
| E-Mail | `customfield_11949` | TextField (String) |
| Analista em Suporte | `customfield_24952` | UserPicker |
| Responsável pelo Encerramento | `customfield_12163` | MultiUserPicker |
| Aprovação Americanas | `customfield_14888` | MultiUserPicker |
| Responsável | `assignee` | User (sistema) |
| Relator | `reporter` | User (sistema) |

## Agendamento, datas e atendimento

| Campo | ID | Tipo na API |
|---|---|---|
| Data/Hora - Agendamento | `customfield_12036` | DateTime (ISO-8601) |
| Data de Atendimento | `customfield_12440` | TextField (String) |
| Melhor horário para atendimento técnico | `customfield_12354` | TextField (String) |
| Data/Hora - Início | `customfield_10702` | DateTime (ISO-8601) |
| Data/Hora - Término | `customfield_10703` | DateTime (ISO-8601) |
| Data/Hora - Início Spare | `customfield_25019` | DateTime (ISO-8601) |
| Número de Visita | `customfield_12657` | Number (Float) |
| Necessidade de Retorno | `customfield_12353` | Select (`SIM` / `NÃO`) |
| Erro no encerramento? | `customfield_13189` | Select (`SIM` / `NÃO`) |
| Erro na resolução? | `customfield_12917` | Select (`SIM` / `NÃO`) |

## Localização, loja e endereço

| Campo | ID | Tipo na API |
|---|---|---|
| Cidade / UF | `customfield_12317` | CascadingSelect |
| UF | `customfield_12075` | TextField (String) |
| É Capital? | `customfield_13419` | Select (`SIM` / `NÃO`) |
| Código da Loja | `customfield_14954` | Select |
| Código da loja (Texto) | `customfield_14809` | TextField (String) |
| Código da Loja Old | `customfield_14865` | Select |
| Nome da loja | `customfield_14810` | TextField (String) |
| Loja | `customfield_14956` | Select (`SHOPPING` / `RUA`) |
| Cadastro da Loja | `customfield_14982` | Assets Object (CMDB) |

## Equipamentos, peças e hardware

| Campo | ID | Tipo na API |
|---|---|---|
| Equipamento / Modelo | `customfield_15088` | CascadingSelect |
| Equipamento | `customfield_15087` | Assets Object (CMDB) |
| Patrimônio | `customfield_15089` | TextField (String) |
| Data de Vencimento da Garantia | `customfield_15090` | DatePicker (`YYYY-MM-DD`) |
| Spare | `customfield_12490` | Select (`SIM`) |
| Tipo | `customfield_12071` | Select |
| CPU PDV | `customfield_14905` | Number |
| Gaveta | `customfield_14906` | Number |
| Impressora Fiscal | `customfield_14907` | Number |
| Memória RAM | `customfield_14908` | Number |
| Placa Mãe | `customfield_14909` | Number |
| Monitor | `customfield_14910` | Number |
| Scanner | `customfield_14911` | Number |
| SSD | `customfield_14912` | Number |
| Teclado | `customfield_14913` | Number |
| Cabeça de Impressão | `customfield_14914` | Number |
| Cabo SATA | `customfield_15120` | Number |
| Patch cord 3m | `customfield_15121` | Number |
| Conector RJ45 | `customfield_15122` | Number |
| Conector RJ11 | `customfield_15123` | Number |
| Fonte Interna | `customfield_16140` | Number |
| Cabo de Teclado | `customfield_16141` | Number |
| Tela PDV Touch | `customfield_16142` | Number |
| Tela Cliente Touch | `customfield_16143` | Number |
| Monitor Touch | `customfield_16144` | Number |
| Bateria CMOS | `customfield_16145` | Number |
| Botão Power | `customfield_16146` | Number |
| Gabinete | `customfield_16147` | Number |
| FAN | `customfield_16148` | Number |
| Cabeça de Impressão Printronix | `customfield_17754` | Number |
| Valor Total de Equipamentos | `customfield_14880` | Number (Float) |

## Financeiro e custos

| Campo | ID | Tipo na API |
|---|---|---|
| Valor total do KM | `customfield_12416` | Number (Float) |
| Detalhes de custos adicionais | `customfield_12417` | TextArea (ADF/String) |
| Custo Visita 2 | `customfield_12419` | Number (Float) |
| Pagamento Antecipado | `customfield_16434` | Select (`Sim` / `Não`) |
| Descrição de Pagamento | `customfield_16435` | TextArea |
| Chamado Faturado | `customfield_19825` | Select (`Sim` / `Não`) |

## Defeito, solução e fluxo

| Campo | ID | Tipo na API |
|---|---|---|
| Tipo de problema | `customfield_12374` | TextField (String) |
| Defeito alegado | `customfield_12478` | TextArea |
| Resumo do defeito | `customfield_14811` | TextArea |
| Solução | `customfield_12351` | TextArea |
| Correção de Categoria de abertura | `customfield_15103` | Select |
| Aprovação | `customfield_14889` | Select |
| Chamado Duplicado | `customfield_14867` | Select |
| Chamado Principal Encerrado | `customfield_14959` | Select |
| Tipo de remanejamento | `customfield_23466` | Select |
| Parceria | `customfield_13261` | Select |
| Grupo | `customfield_10600` | GroupPicker |
| Customer Request Type | `customfield_10400` | ServiceDesk |

## Fluxo de agendamento

1. `PUT /rest/api/3/issue/{key}` com os campos individuais do técnico e `customfield_12279`.
2. `POST /rest/api/3/issue/{key}/transitions` com a transição `9`, incluindo `customfield_12036` e `customfield_12279` para satisfazer os validadores do workflow.
