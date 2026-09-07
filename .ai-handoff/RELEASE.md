# Runbook de teste e publicação

## Preparação local

Requisitos: Node 22.13+, npm, Rust/Tauri para desktop e credenciais locais válidas.

```powershell
npm install
npm run dev
```

Use `.env.example` e `.env.voice.example` como modelos; os valores reais ficam em `.env.local` e nunca entram no Git.

## Validação mínima

```powershell
npm test
npx tsc --noEmit
npm run build
```

Também confira manualmente:

- login e permissões por perfil;
- filtros do Kanban e calendário;
- abrir Jira e WhatsApp;
- status/agendamento com releitura do Jira;
- técnico, valores, total, resumo e salvar;
- anexar, visualizar e baixar evidência;
- chamada recebida/realizada, minimizar, encerrar e compartilhar tela;
- layout em desktop e largura mínima suportada.

## Publicação web

Este projeto contém `.openai/hosting.json`; use o fluxo oficial do OpenAI Sites. O pacote deve conter o `dist/` produzido por `npm run build`, a configuração de hosting e migrations `drizzle/`. Gere uma credencial nova por release, envie exatamente o commit que será publicado, salve uma nova versão e implante no domínio customizado.

Depois, confirme:

- status da implantação concluído;
- `https://operacoes.cajutech.net` responde corretamente;
- `https://operacoes.cajutech.net/api/app-version` retorna a versão esperada;
- download público do instalador responde e o SHA-256 coincide com o arquivo local.

## Executável Windows

Só incremente a versão quando houver mudança no shell Tauri, permissões, ícone, comandos Rust ou quando for desejável distribuir um instalador novo.

```powershell
npm run desktop:build
```

O artefato NSIS é gerado sob `src-tauri/target/release/bundle/nsis/`. Copie para `public/downloads/Caju-OS-<versão>-x64-setup.exe`, calcule `Get-FileHash -Algorithm SHA256` e publique o site novamente.

Como `frontendDist` aponta para a URL de produção, mudanças apenas em React/CSS não exigem recompilar o EXE: o 0.1.13 recebe a UI web publicada.

## Git

- Revise `git status --short`; há muitos artefatos locais antigos não rastreados.
- Adicione somente arquivos intencionais por caminho explícito.
- Nunca faça commit de `.env.local`, logs, `target/`, pastas temporárias ou pacotes antigos.
- Registre no commit o escopo real da release.

