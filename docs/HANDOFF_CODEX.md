# Passagem de bastão (para continuar em outra ferramenta)

Estado em 2026-10-02. Tudo o que está aqui já foi para `main` (web) e para a branch
`claude/distribuicao-app` (app mobile, canal EAS `preview`).

## Como publicar
- **Web (Cloudflare Worker `caju-os`)**: `npm test && npm run build && npm run deploy`.
  O deploy usa `dist/server/wrangler.json`; comandos do wrangler precisam de
  `-c dist/server/wrangler.json` (ex.: `npx wrangler d1 execute caju-os-prod --remote -c dist/server/wrangler.json --command "..."`,
  `npx wrangler secret put NOME -c dist/server/wrangler.json`).
- **Migrações D1**: `npm run db:migrate:remote` falha (erro de auth 10000). Aplicar o `.sql` com
  `wrangler d1 execute --file` e registrar com `INSERT INTO d1_migrations (name) VALUES ('00NN_nome.sql')`.
- **App mobile**: `npx tsc --noEmit && npx expo lint`, depois
  `npx eas-cli@latest update --branch preview --environment preview --platform android --non-interactive`.
- **WhatsApp (OpenWA + adapter, Fly)**: fontes em `whatsapp-openwa/`; copiar `adapter/` para
  `../openwa-fly/adapter` (sem CRLF) e `flyctl deploy --remote-only` lá. Apps: `caju-openwa`, `caju-openwa-adapter`.
- Vários arquivos web usam CRLF: editar preservando o fim de linha.

## Segredos/variáveis relevantes (Cloudflare)
`DISPATCH_MODE`, `DISPATCH_ALLOWLIST`, `DISPATCH_BLOCKLIST` (ids de técnicos; hoje `1,2,8800`),
`DISPATCH_ANALYST_PHONES` (avisos de aceite no WhatsApp dos analistas), `WHATSAPP_BRIDGE_URL_CAJU`,
`WHATSAPP_BRIDGE_SECRET_CAJU`, `CRON_SECRET`.

## Regras de negócio já implementadas
- Oferta de chamado só para técnicos da MESMA cidade (cidade base; "outras cidades" não conta).
  Sem técnico na cidade: oferta retida + aviso no sistema, nenhuma mensagem.
- Reoferta de chamado aceito: tira o técnico (Caju OS + Jira) e não reenvia a quem já aceitou.
- Aceite avisa também o WhatsApp dos analistas.
- Grupo do WhatsApp do chamado: nome com o FSA (aceita número abreviado "(FSA-1 | 825)"), data mais recente no título.
- Série diária da fila em `daily_kpis` (cron a cada 10 min) para comparar períodos na Visão geral.

## Pedidos do chefe (áudios de 30/09) — situação
Feitos: 1-13 e 15-21, 23-26, 29 (inclui painel Equipe redimensionável, aceites clicáveis, histórico da loja,
histórico por técnico na Distribuição, atividade por pessoa em Gestão > Equipe, resumo da gestão e comparação de períodos).
O item 7 (contagem 12 vs 11) parece ser o próprio usuário somado à lista; não alterado.
Pendentes: 27 (solicitações da gerência → equipe cria grupo/técnico/dia e devolve) e 28 (checklist de prioridades por
colaborador) — precisam de desenho junto com o chefe. 14 e 22 eram perguntas ao chefe.
Mais detalhes no histórico de commits (`git log --oneline`).
