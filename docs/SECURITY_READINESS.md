# Security readiness

## Implementado

- Todas as APIs que usam `requireApiUser` passam por rate limit por IP.
- Escritas autenticadas têm limite mais baixo que leituras.
- Recuperação de senha tem rate limit mesmo sem login.
- Convite de usuário registra evento de auditoria sanitizado.
- Negativa por cargo registra evento de auditoria sanitizado.
- Upload de evidências para o Jira valida quantidade, tamanho, extensão e assinatura binária.
- Logs de segurança removem `Bearer`, tokens, senhas, cookies e chaves antes de gravar.

## Ainda necessário antes de vender

- Ativar retenção e alerta dos logs do Cloudflare.
- Criar backup automático diário do D1 com `wrangler d1 export`.
- Guardar backups fora da Cloudflare, com retenção mínima de 30 dias.
- Criar ambiente staging separado.
- Fazer teste de restauração mensal.
- Rodar revisão externa LGPD/segurança antes do primeiro cliente pago.

## Plano de recuperação

1. Falha no Jira: manter operações locais, enfileirar alterações e reenviar depois.
2. Falha no D1: restaurar último backup exportado em novo D1 e trocar binding `DB`.
3. Falha no Worker: rollback para commit anterior pela Cloudflare ou novo push revertendo.
4. Vazamento de token: revogar token no provedor, trocar secret no Cloudflare, publicar novo deploy.
5. Falha no SharePoint/Power Automate: manter cadastro local e sincronizar pendências depois.

