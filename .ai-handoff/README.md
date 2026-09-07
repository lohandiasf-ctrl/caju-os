# Continuidade do Caju OS

Este diretório é o ponto de entrada para outra IA ou pessoa continuar o produto sem depender do histórico desta conversa.

## Estado atual

- Produção: `https://operacoes.cajutech.net`
- Instalador público: `https://operacoes.cajutech.net/downloads/Caju-OS-0.1.13-x64-setup.exe`
- Versão do desktop: `0.1.13`, em `src-tauri/tauri.conf.json`
- Hospedagem: OpenAI Sites + Cloudflare Worker/D1, configurada em `.openai/hosting.json`
- Voz: WebRTC com servidor de sinalização separado em `signaling-server/` (Railway)
- Integração principal: Jira Cloud REST API v3
- Última base funcional antes desta documentação: commit `a25df52`

O pedido mais recente foi restaurar o acabamento visual removido por otimizações agressivas de 60 FPS. Foram restaurados blur, transparência, transições e background fixo. As otimizações sem impacto visual foram mantidas.

## Leia conforme a tarefa

- Arquitetura, fluxos e arquivos: [ARCHITECTURE.md](ARCHITECTURE.md)
- Jira, campos e regras de transição: [JIRA.md](JIRA.md)
- Dados e migrations: [DATA.md](DATA.md)
- Funcionalidades existentes: [FEATURES.md](FEATURES.md)
- Limitações e trabalho pendente: [BACKLOG.md](BACKLOG.md)
- Teste, build, EXE e publicação: [RELEASE.md](RELEASE.md)

## Segurança

Credenciais reais ficam fora do Git. Variáveis esperadas:

- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_PROJECT_KEY`, `JIRA_API_TOKEN`
- Firebase conforme `lib/firebase.ts` e `lib/server/firebase-auth.ts`
- `NEXT_PUBLIC_SIGNALING_URL`, `NEXT_PUBLIC_TURN_URLS`, `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL`

Não copie valores de `.env.local` para documentação, logs, commits ou respostas.

