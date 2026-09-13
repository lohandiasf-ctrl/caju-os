# Revisão pré-lançamento dos vídeos (2026-09-12)

Os vídeos são checklists genéricos, não uma especificação do Caju OS. Esta
revisão registra a correspondência com a arquitetura real (aplicação interna
Next/vinext em Cloudflare Workers, D1 no servidor, Firebase Authentication).
Não implica certificação de segurança nem substitui revisão jurídica.

## Segurança (vídeo 1)

| Item do vídeo | Situação no Caju OS |
|---|---|
| 1. Ocultar chaves de API | Segredos do Jira/SharePoint via ambiente do Worker; chave de configuração web do Firebase é pública por definição. Revisar outros provedores antes de produção. |
| 2. Remover segredos do histórico Git | Pendente auditoria completa do histórico e rotação caso apareçam segredos. Não reescrever histórico automaticamente. |
| 3. Usar chave pública do banco | Não aplicável: D1 acessível só pelo Worker, sem chave no cliente. |
| 4. Row-level security | Não aplicável ao D1; escopo por usuário e papel nas rotas deve continuar sendo testado. |
| 5. Criptografar dados sensíveis | Pendente política de criptografia de campos pessoais, chaves e recuperação. Não usar criptografia improvisada. |
| 6. Autenticação no servidor | Existente em `requireApiUser`; rotas de recuperação/cron têm fluxos específicos. |
| 7. Restringir acesso a registros | Existente em várias rotas por papel, destinatário ou membro; requer revisão de autorização por rota. |
| 8. Bloquear adulteração de campos | Parcial: validações de campos críticos no servidor; entradas de chat reforçadas nesta mudança. |
| 9. Cookies de sessão seguros | Firebase usa token Bearer, não cookie de sessão do app. Cookie de preferência lateral agora usa SameSite e Secure em HTTPS. |
| 10. Hash de senhas | Responsabilidade do Firebase Authentication; o app não armazena senha. |
| 11. Limitar tentativas de login | Firebase aplica proteção própria; limite adicional por IP requer regra Cloudflare WAF. |
| 12. Proteção contra bots | Pendente configuração de WAF/Turnstile e avaliação de UX para login/recuperação. |
| 13. Parametrizar consultas | Drizzle/D1 usa parâmetros nas consultas revisadas. |
| 14. Validar entradas | Parcial; chat e anexos N1 reforçados. Revisão abrangente ainda necessária. |
| 15. Escapar conteúdo de usuário | React escapa texto por padrão. Auditar usos excepcionais de HTML e links externos. |
| 16. Restringir uploads | Limites já existentes; nesta mudança, chats/N1/RAT verificam assinatura dos arquivos, além do MIME informado. |
| 17. Reduzir respostas de API | Parcial; revisar respostas de endpoints sensíveis e payloads de evidências. |
| 18. Cabeçalhos de segurança | Incluídos no wrapper do Worker: nosniff, anti-frame, referrer, HSTS HTTPS e permissões. CSP fica pendente de inventário das integrações. |
| 19–20 | Sem texto nos quadros do vídeo. |

## Website (vídeo 2)

| Item do vídeo | Situação no Caju OS |
|---|---|
| 1–2. Privacidade e termos | Pendentes dados jurídicos reais: controlador/CNPJ, contato, base legal, retenção, operadores e regras de uso. Não publicar texto fictício. |
| 3. Segredos fora do frontend | Mesmo item de segurança 1. |
| 4. HTTPS | Domínio de produção usa HTTPS; HSTS acrescentado no Worker. Conferir configuração TLS da zona Cloudflare. |
| 5. Banner de cookies | Não há rastreamento de terceiros identificado; só preferência funcional da barra lateral. Implementar consentimento antes de adicionar cookies não essenciais. |
| 6. Metatítulos e descrições | Já presentes no layout. |
| 7. Preview social | Não recomendado para aplicação interna; conteúdo não deve ser indexado ou divulgado. |
| 8. Favicon | Já presente. |
| 9. Sitemap/robots | `robots.txt` e metadados noindex agora bloqueiam indexação; sitemap público não se aplica ao painel interno. |
| 10. Texto alternativo | Parcial; auditar imagens de todo o app com leitor de tela. |
| 11–12. Compressão/velocidade | Pendente auditoria Lighthouse com perfil autenticado e rede móvel. |
| 13–14. Contraste/mobile | Pendente revisão completa com testes visuais e aparelhos reais. |
| 15. Página 404 | Criada página de erro com caminho de volta. |
| 16. Links quebrados | Pendente varredura autenticada por papel e links externos. |
| 17. Validação de formulários | Parcial; servidor valida mensagens e anexos. Revisar cada formulário. |
| 18. Proteção contra spam | Pendente WAF/Turnstile em pontos públicos. |
| 19. Analytics | Não ativar rastreamento de colaboradores sem política de privacidade, propósito e consentimento/base legal definidos. |
| 20. Chamada para ação | Login e ações de atendimento já existem; revisar por tarefa em testes de usabilidade. |

## Próxima etapa antes de produção

Revisão de autorização por rota, scan de segredos em todo o histórico,
configuração WAF/rate limit, política de privacidade/termos com dados reais,
e teste visual/acessibilidade autenticado. Não presumir que o checklist está
concluído apenas porque os itens visíveis foram codificados.
