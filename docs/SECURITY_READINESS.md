# Security readiness

## Implementado

- Todas as APIs que usam `requireApiUser` passam por rate limit por IP.
- Escritas autenticadas têm limite mais baixo que leituras.
- Recuperação de senha tem rate limit mesmo sem login.
- Convite de usuário registra evento de auditoria sanitizado.
- Negativa por cargo registra evento de auditoria sanitizado.
- Upload de evidências para o Jira valida quantidade, tamanho, extensão e assinatura binária.
- Logs de segurança removem `Bearer`, tokens, senhas, cookies e chaves antes de gravar.
- Backup diário do D1 configurado em GitHub Actions (`D1 backup`), com artefato
  SQL retido por 30 dias.
- Script local/remoto: `npm run backup:d1:remote`.

## Ainda necessário antes de vender

- Ativar retenção e alerta dos logs do Cloudflare.
- Confirmar que os secrets `CLOUDFLARE_API_TOKEN` e
  `CLOUDFLARE_ACCOUNT_ID` existem no GitHub.
- Criar ambiente staging separado.
- Fazer teste de restauração mensal.
- Rodar revisão externa LGPD/segurança antes do primeiro cliente pago.

## Plano de recuperação

1. Falha no Jira: manter operações locais, enfileirar alterações e reenviar depois.
2. Falha no D1: restaurar último backup exportado em novo D1 e trocar binding `DB`.
3. Falha no Worker: rollback para commit anterior pela Cloudflare ou novo push revertendo.
4. Vazamento de token: revogar token no provedor, trocar secret no Cloudflare, publicar novo deploy.
5. Falha no SharePoint/Power Automate: manter cadastro local e sincronizar pendências depois.
