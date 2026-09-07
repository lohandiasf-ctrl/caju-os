# Caju OS — instruções para agentes

Antes de alterar este projeto, leia integralmente `.ai-handoff/README.md` e os documentos que ele referencia.

## Regras obrigatórias

- Preserve alterações existentes do usuário e não apague artefatos sem autorização.
- Nunca grave tokens, senhas, cookies ou credenciais no Git. Use `.env.local` apenas localmente e mantenha exemplos vazios.
- A fonte da verdade do produto é o código, o esquema em `db/schema.ts`, as migrations em `drizzle/` e a configuração `.openai/hosting.json`.
- Para Jira, descubra transições e campos permitidos pela API; não suponha que um `customfield` esteja disponível em todas as telas ou tipos de chamado.
- Mudanças de status no Jira devem preencher primeiro os campos obrigatórios e só depois executar a transição.
- Preserve o visual premium (blur, transparência e transições). O usuário rejeitou a simplificação visual feita para “60 FPS”. Otimize lógica e renderização sem empobrecer o design.
- O executável Tauri carrega `https://operacoes.cajutech.net`; alterações somente web aparecem no EXE atual após publicação. Gere novo instalador apenas quando código/configuração Tauri ou versão mudar.
- Antes de publicar, rode `npm test`, `npx tsc --noEmit` e `npm run build`.
- Não declare uma integração “em tempo real” se ela depender de polling. Consulte `.ai-handoff/BACKLOG.md`.
- Atualize a documentação de handoff quando arquitetura, ambiente, versão, migração ou processo de release mudar.

## Ordem recomendada

1. `git status --short` e `git log -5 --oneline`.
2. Leia a área do código envolvida e os testes correspondentes.
3. Faça uma mudança pequena e verificável.
4. Execute validações proporcionais ao risco.
5. Siga `.ai-handoff/RELEASE.md` para publicação.

