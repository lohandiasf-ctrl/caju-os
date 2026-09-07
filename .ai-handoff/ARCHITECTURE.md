# Arquitetura e mapa do código

## Stack

- React 19 + TypeScript + Tailwind CSS 4.
- Vinext/Vite para aplicação full-stack e Cloudflare Workers.
- Drizzle ORM + Cloudflare D1 (SQLite).
- Firebase Authentication para identidade.
- Tauri 2 para o aplicativo Windows/WebView.
- WebRTC + Socket.IO para voz e compartilhamento de tela.

## Superfícies principais

- `app/page.tsx`: Kanban, filtros, calendário, detalhes do chamado, notificações e integração das principais ações.
- `components/operation-workflow-dialog.tsx`: gestão operacional, agenda, técnico, custos, anexos, resumo técnico, transições Jira e auditoria.
- `components/user-menu.tsx`: colegas, chat, presença, chamadas, reunião em grupo, minimização e compartilhamento de tela.
- `app/central-n1/page.tsx`: central N1.
- `app/financeiro/page.tsx`: visão financeira.
- `app/mapa/page.tsx`: mapa operacional.
- `app/spares/page.tsx`: peças/spares.
- `app/globals.css`: identidade visual global. Não remover blur e transparência por motivos de desempenho sem aprovação do usuário.

## Backend

- `app/api/jira/**`: leitura, atualização, transições, anexos, validação e WhatsApp.
- `lib/server/jira.ts`: cliente Jira, normalização de campos, ADF e transições.
- `lib/server/jira-sync.ts`: sincronização/cache Jira.
- `app/api/operations/**`: fluxo operacional, tarefas, rastreio, auditoria e inteligência.
- `app/api/operational-dashboard/route.ts`: métricas agregadas.
- `db/schema.ts`: fonte da verdade do modelo local.

## Desktop

- `src-tauri/tauri.conf.json`: versão, URL remota, janela e empacotamento.
- `src-tauri/src/main.rs`: foco de chamadas, links externos, Chrome/WhatsApp e clipboard.
- O EXE é um shell remoto: o frontend publicado é carregado pelo executável. Código Rust/configuração exigem uma nova build; CSS/React publicado não.

## Voz e tela

- `lib/voice-chat.ts` concentra tipos e utilidades.
- `components/user-menu.tsx` mantém WebRTC, toque, notificações e UI de chamada.
- `signaling-server/` é implantado separadamente no Railway.
- Para produção estável fora de redes simples, TURN precisa estar configurado. Não registrar credenciais TURN no Git.

## Convenções importantes

- Horários da interface devem respeitar `America/Sao_Paulo`; Jira usa DateTime ISO com offset.
- Nomes visíveis devem usar nome completo, nunca apenas `@`/handle.
- Filtros do Kanban exibem somente a coluna selecionada; “Todos” restaura todas.
- Abertura no Jira e WhatsApp no desktop passa pelos comandos Tauri quando disponíveis.

