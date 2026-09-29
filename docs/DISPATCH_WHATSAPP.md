# Distribuição de chamados por WhatsApp

Chamado novo → oferta no WhatsApp para todos os técnicos elegíveis da cidade →
o primeiro que tocar em **Aceitar atendimento** fica com o atendimento. FSAs da
mesma loja saem numa oferta só e são aceitos juntos. A disputa é resolvida no
banco, nunca pela ordem das mensagens.

Especificação completa: combinada com o responsável em 2026-09-27 (texto na
conversa com o Claude; resumo aqui). Canal: **WhatsApp Cloud API oficial**,
número exclusivo de distribuição.

## Onde está

| Parte | Arquivo |
|---|---|
| Regras puras (agrupamento, elegibilidade, mensagem, SQL do aceite, templates) | `lib/dispatch.ts` |
| Rodada do cron, criação de oferta, aceite atômico | `lib/server/dispatch.ts` |
| Cron (a cada 10 min, via `scripts/worker-entry.js`) | `POST /api/dispatch/run` |
| Painel / conferência (gerência e coordenação) | `GET /api/dispatch/offers` |
| Templates versionados, envio para análise da Meta (gerência) | `GET/POST /api/dispatch/templates` |
| Tabelas | `drizzle/0046_dispatch_offers.sql` |
| Testes (inclui a disputa num SQLite real) | `tests/dispatch.test.ts` |

## Regras

- **Elegível:** técnico com cadastro aprovado, telefone válido para WhatsApp e
  a cidade do chamado como cidade base (mesma UF) ou em "outras cidades". O
  `status` (online/ocupado) não entra.
- **Chamado novo:** Jira em pendente de agendamento, sem técnico, aberto nas
  últimas 24 h (`LOOKBACK_HOURS`: na primeira ligada a fila antiga não dispara).
- **Agrupamento:** pelo código da loja normalizado (`Loja 330` = `L330` =
  `0330`). Sem código de loja, o chamado fica sozinho. Janela = a rodada do
  cron (10 min).
- **Retida (`held`):** falta código de loja, cidade, **Defeito alegado** ou não
  há técnico elegível. Não sai mensagem; aparece no painel com o motivo. O
  resumo nunca é trocado pela categoria ou pelo título.
- **Expiração:** 2 h (`OFFER_HOURS`). Vencida, os FSAs ficam livres para uma
  nova oferta.
- **Aceite:** `ACCEPT_OFFER_SQL` — `UPDATE … WHERE status = 'open' AND
  expires_at > agora AND o técnico recebeu a oferta`. Só quem muda a linha
  ganha; os demais recebem "já aceito". Reenvio do mesmo clique responde de
  novo "ganhou" para o vencedor, sem gravar duas vezes.
- **Idempotência:** índice único parcial `ticket_key WHERE active = 1` — o
  mesmo FSA não fica em duas ofertas valendo, mesmo com retry.

## Modos (`DISPATCH_MODE` no Worker)

| Modo | O que faz |
|---|---|
| vazio / `off` | nada |
| `dry_run` | cria ofertas e destinatários como simulação; **nenhuma mensagem** |
| `allowlist` | envia só para os técnicos cujo telefone está em `DISPATCH_ALLOWLIST` (vírgula) |
| `live` | envia para todos os técnicos elegíveis |

## Oferta de teste

No painel **Distribuição**, a gerência tem o botão **Enviar oferta de teste**
(`POST /api/dispatch/test`): cria uma oferta com loja `L999` e chamado
`TESTE-<id>` fictícios e manda o template aprovado só para os técnicos cujo
telefone está em `DISPATCH_ALLOWLIST` (vale em qualquer modo). O aceite roda a
disputa, responde no WhatsApp e avisa a equipe com "Teste ·" no título, mas
não vincula chamado nem mexe no Jira. Se ninguém aceitar, expira sem aviso.

## Configuração na Meta (feita em 2026-09-28)

- App **Caju Envio** (caso de uso WhatsApp, portfólio Caju Tech).
- Conta do WhatsApp da distribuição e número próprio, registrado na Cloud API.
- Segredos no Worker `caju-os`: `WHATSAPP_ACCESS_TOKEN` (usuário do sistema,
  sem validade), `META_APP_SECRET` (do app Caju Envio),
  `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`. IDs e números não
  vão para o código: o repositório é público.
- O webhook `/api/whatsapp/webhook` grava as mensagens desse número na conta
  `despacho`, separada das caixas Suporte e Caju (que usam bridge).

## Etapas

1. **E0** — assistente não conta Direcionado como agendado (PR #141). ✅
2. **E1** — este PR: tabelas, regras, rodada em `dry_run`, painel via API,
   templates no código, correção do webhook oficial. Envio real: não.
3. **E2** — aprovar templates, painel visual, envio para lista de teste.
4. **E3** — clique no botão pelo webhook → aceite → vínculo no Caju OS e no
   Jira (fila `jira_sync_jobs`, sem reabrir a disputa se o Jira falhar) →
   respostas "confirmado" / "já aceito".
5. **E4** — técnicos reais, página `/despacho/{id}` da oferta agrupada.

## Depois do aceite (E3a)

O clique chega pelo webhook `/api/whatsapp/webhook` (`button.payload =
aceitar:<oferta>`). O técnico é identificado pelo número que clicou, comparado
aos destinatários da oferta (sem o nono dígito). Só quem ganha a disputa:

- recebe "Atendimento confirmado…"; os demais, "já foi aceito…" ou "expirou";
- fica vinculado nos FSAs em `operational_workflows.technician_id`;
- vai para o Jira (Dados dos Técnicos) pela fila `jira_sync_jobs` — se o Jira
  falhar, repete sozinho, sem reabrir a disputa;
- dispara aviso à equipe: push tipo **Distribuição** (gerência e coordenação,
  desligável em Configurações → Avisos) e mensagem no grupo **Distribuição**
  do chat do Caju OS (criado na primeira vez).

Oferta que vence sem aceite (fora do `dry_run`) gera o aviso "Ninguém aceitou".
Reenvio do webhook pela Meta não responde nem vincula duas vezes.

Templates de aviso para os gestores (`NOTICE_TEMPLATES`: aceito, sem resposta,
resumo) já vão para aprovação junto; o envio deles pelo WhatsApp, com a janela
de entrega de cada gestor, resumo e pausa, é a E3b.

## Decisões ainda abertas

FSA novo depois do aceite (nova oferta ou mesmo técnico?), aviso proativo aos
que não ganharam (custa um template por técnico), política de falha parcial no
Jira num grupo, e de onde vem a linha "CPU" (hoje: `Equipamento Marca/Modelo`
+ PDV).
