# Bugs conhecidos — Caju OS

Legenda: **Resolvido** · **Parcial** · **Pendente** · **Validar em produção**

Muitos itens vêm do histórico em `.ai-handoff/BACKLOG.md`; o estado abaixo
reflete o que se sabe hoje. Quando um item disser "validar em produção", é
porque a correção está no código mas ninguém confirmou no ambiente novo
pós-migração Cloudflare.

---

## Notificações e chamadas

| Item | Estado | Nota |
|---|---|---|
| Notificação/chamada no app e na área de trabalho | **Validar em produção** | integra `communication_preferences` + plugin Tauri; conferir quiet hours e mute por tipo |
| Chamada recebida não toca / não abre janela | **Validar em produção** | `show_voice_call_window` (Tauri) |
| Chamada minimizada some ou não restaura | **Parcial** | janela dedicada existe; testar minimizar → restaurar |
| Tela compartilhada aparece preta | **Parcial** | `ontrack` reconstrói o stream quando o WebView omite `event.streams` (mobile) — testar em desktop e mobile |
| Fullscreen não funciona em mobile | **Pendente** | `setFullscreen` do Tauri; comportamento inconsistente em WebView mobile |
| Quadrado branco no WebView durante carga | **Resolvido** | tela de loading da marca substituiu o vazio (`components/caju-loading.tsx`) |

## Spares e rastreio

| Item | Estado | Nota |
|---|---|---|
| "Abrir planilha" no app desktop abria dentro do WebView e prendia o usuário | **Resolvido (web)** | `lib/open-external.ts` nunca navega a janela atual; abrir direto pelo app ainda exige liberar o host do SharePoint em `open_external_url` (Rust) e gerar EXE novo |
| Diálogo do chamado diz "Rastreio salvo e monitorado", mas só parte desses rastreios é consultada | **Parcial** | códigos ligados a um spare ativo são consultados pelo cron (`/api/spares/tracking`, a cada 6 h por código até "Entregue"); código digitado só no diálogo, sem spare correspondente, continua sem consulta |
| Datas de previsão de entrega e atendimento apareciam como números seriais do Excel (ex: 46290 e 46293) | **Resolvido** | normalizado em `lib/spares-pull.ts`, rotas de API, tela de spares e chamado |

## Jira

| Item | Estado | Nota |
|---|---|---|
| Campo `cannot be set ... not on the appropriate screen` trava o fluxo | **Resolvido (design)** | fallback por `customfield_12279`/ADF + fila `jira_sync_jobs`; ver `docs/JIRA_FIELDS.md` |
| Sincronização Jira falha por rede transitória | **Resolvido** | outbox `jira_sync_jobs`, reprocessável em `/api/admin/jira-sync` |
| Salvar chamado com transição no Jira no ambiente novo | **Validar em produção** | **prioridade 1** — único fluxo crítico não exercitado pós-migração |
| Chave errada de API do Jira devolve 200 com 0 chamados | **Resolvido** | detectado; exige token da conta com acesso ao projeto FSA |

## Anexos / evidências

| Item | Estado | Nota |
|---|---|---|
| Chat/N1 aceitava MIME declarado sem conferir os bytes do anexo | **Resolvido no código; validar em produção** | Imagens, áudios, vídeos e PDF em data URL agora precisam de assinatura coerente; RAT também valida a foto antes da IA. Anexos legados não foram alterados. |
| `bitmap.close()` antes de ler `width/height` → toda foto reportava 0x0 e o upload era bloqueado | **Resolvido** | `components/jira-ticket-details.tsx` — lê as dimensões antes do `close()` |
| Chave do Google Maps com `&v=weekly` colado no valor | **Resolvido** | era o secret; irrelevante agora (mapa é Leaflet) |
| Duas validações de foto divergentes (avisa vs. bloqueia) | **Resolvido** | `lib/image-validation.ts` virou fonte única; N1 avisa, upload ao Jira bloqueia usando o mesmo motor |
| Histórico de `ticket_evidence` e `employee_messages` não migrou do OpenAI Sites | **Pendente (perda aceita)** | não havia endpoint de leitura na produção antiga |

## Mapa e busca de técnico

O feedback de 2026-09-14 apontou lentidão forte do mapa no celular e sobreposição
ao menu lateral. O mapa agora inicia sob demanda em telas pequenas e seu
contêiner cria contexto de empilhamento próprio; validar em dispositivo real.

O campo de técnico na agenda estava lendo `assignee` (responsável no Jira),
não `customfield_12316` (Nome do Técnico). Corrigido no código; validar com
chamados em produção que tenham o campo preenchido.

Exportação Google Contatos: o clique em download não deixava confirmação nem
link de recuperação no celular. O CSV agora é anexado ao DOM antes do clique e
um link para salvar fica visível. Validar no WebView/Android usado pela equipe.

Na branch `codex/technician-dispatch-and-contacts`, há uma busca nova por centros de cidades. Ela mostra distância geográfica aproximada; técnicos sem cidade encontrada no mapa local não aparecem no ranking. Validar cobertura com a base real antes da publicação.

| Item | Estado | Nota |
|---|---|---|
| Mapa (Google) não renderizava tiles, sem erro | **Resolvido** | migrado para **Leaflet + OpenStreetMap**; sem chave/cota |
| Buscar cidade sem técnico não mostrava ninguém | **Resolvido** | geocodifica via `/api/geocode` (Nominatim + cache) e lista os mais próximos |
| Raio de 55 km escondia todos quando ninguém estava dentro | **Resolvido** | virou faixa de destaque; fallback mostra os 8 mais próximos |
| Distância é estimada por faixas, não real | **Pendente (limitação)** | técnicos não têm lat/lng no banco; custo de deslocamento em R$ é aproximado |
| Cruzamento técnico ↔ cadastro por nome+cidade pode falhar | **Validar em produção** | grafia diferente (abreviação, "junior" vs "Jr") → telefone não aparece no painel |

## Chat / grupos

| Item | Estado | Nota |
|---|---|---|
| Renomear grupo, excluir grupo, editar/apagar mensagem própria | **Resolvido** | `app/api/chat-groups/[id]/route.ts` e `.../messages/[messageId]/route.ts`; apagar esconde só para os outros, quem enviou continua vendo |
| Cadastro de colaborador não aparecia na tela Equipe | **Resolvido** | `EmployeeInvitePanel` agora também renderiza na aba "Equipe interna" para `gerencia` |
| RG fictício ("Não informado") gravável no Jira ao agendar técnico | **Resolvido** | linha de RG fica em branco em vez de texto literal |
| Chamados avulsos fora dos projetos Americanas/Delfia | **Pendente (decisão de produto)** | precisa definir projeto/tipo de issue no Jira antes de implementar |
| Lista de chamados para anexar ao chat só mostra ativos no Jira | **Pendente** | não inclui `ticket_archives`; baixo risco, baixa prioridade |
| Cabeçalho bugado na busca de técnicos de campo | **Não reproduzido** | nenhum `sticky`/`fixed` extra encontrado na seção; precisa print/vídeo do problema real |

## Calendário / agenda

| Item | Estado | Nota |
|---|---|---|
| Horários / calendário do agendamento | **Validar em produção** | conferir fuso e `dateTimeLocal()` em `jira-ticket-details.tsx` |

## Kanban / filtros

| Item | Estado | Nota |
|---|---|---|
| Trocar seleção alterava status no Jira | **Resolvido (regra)** | só altera após clique explícito; ver `docs/WORKFLOW_RULES.md` |
| Filtros do Kanban / calendário | **Validar em produção** | |
| Item "Feedback" no menu não fazia nada | **Resolvido** | havia lista branca de views paralela ao tipo; unificada em `DASHBOARD_VIEWS` |

## Integração externa

| Item | Estado | Nota |
|---|---|---|
| Botão WhatsApp dependia da sessão aberta no Chrome | **Resolvido (mudança de fluxo)** | "Validar" agora copia o link do Jira para envio manual no grupo SUP; não abre mais o WhatsApp automaticamente |
| Link de WhatsApp por chamado (`jira_issue_links`) não migrou | **Pendente (perda aceita)** | funcionalidade volta a gravar; histórico se foi |
| Planilha de Spares era um CSV estático | **Parcial** | cadastro persistente e conector bidirecional implementados; falta configurar os fluxos Power Automate/secrets e migrar o D1 |

## WhatsApp (bridge Baileys)

Em 2026-09-19 a infraestrutura foi **removida por inteiro** a pedido do
usuário, para ser reconfigurada do zero. As apps do Fly e seus volumes não
existem mais, e `whatsapp_messages`/`whatsapp_conversations` foram esvaziadas.
Os itens abaixo são o que se sabia quando ela caiu — valem como aviso para a
montagem nova, não como bug ativo numa instalação que ainda não existe.

| Item | Estado | Nota |
|---|---|---|
| Conversa 1:1 endereçada por `@lid` não envia nem recebe | **Pendente, causa não fechada** | `sock.sendMessage` aceita o lid, devolve `wamid` e não entrega; como a rota do app só grava depois do `wamid`, a mensagem aparece como enviada na tela. Grupo funcionava normalmente na mesma conta |
| `a9f0597` traduz `@lid` para número antes de enviar | **Não resolveu, e é suspeito** | resolveu `557388181339` para um contato cujo número é `5573988181339` — **sem o nono dígito**. Confirmar se `resolveLidPhone()` devolve JID canônico antes de reusar; do jeito que está pode endereçar para outro número |
| Mídia morava no volume da sessão (`./auth/media`) | **Risco de projeto** | o D1 guarda só `media_id`; destruir o volume levou 474 arquivos. Na montagem nova, considerar R2 ou outro armazenamento fora do volume do bridge |
| Webhook não pode chamar o bridge de volta | **Resolvido (`93db292`)** | o bridge encaminha dentro do handler `messages.upsert` e espera a resposta; chamada de volta trava o processamento de eventos dele |
| Bridge do Suporte em laço de reconexão | **Encerrado sem diagnóstico** | 24 ciclos seguidos de `connected → logging in → Connection Terminated`; sem processar mensagem desde 18/09. A app foi destruída antes de se achar a causa |

## Desempenho / UI

| Item | Estado | Nota |
|---|---|---|
| Mapa operacional, Spares e Financeiro não abriam pelo menu compartilhado | **Resolvido** | páginas próprias agora usam navegação de documento; abas `?view=` preservam troca local |
| "60 FPS" removeu blur/transparência/transições | **Resolvido** | o usuário **rejeitou** a simplificação; visual premium restaurado. Otimize lógica, não o design |
| Navegação entre páginas próprias recarrega o documento | **Resolvido (decisão)** | fallback intencional para contornar o dead-end do roteador cliente do vinext; abas do dashboard continuam sem recarga |
| Render loop no mapa (marcadores recriados a cada render) | **Resolvido** | `fallbackTechnicians` memoizado |
| Lint passava sem rodar (plugin type-aware crashava, exit 0) | **Resolvido** | regras type-aware desligadas; `npm run lint` agora falha de verdade |
| Botão de reunião pintava por cima de diálogos abertos | **Resolvido** | `z-[65]` acima do modal (`z-50`); escala nomeada em `app/globals.css` e lançador sob os modais quando ocioso |
| `/spares` rolava de lado em 375 px | **Resolvido** | abas não cabiam e empurravam o documento; rótulo curto no mobile + `tabs-list` rolando dentro de si |
| Kanban e KPIs do Financeiro só abriam 2 colunas até 1536 px | **Resolvido** | 3 colunas em `xl`, 4 em `2xl`; 1440 px deixou de desperdiçar largura |
| Mapa piscava cinza-claro enquanto os tiles carregavam | **Resolvido** | o CSS do Leaflet entra em runtime e vencia por ordem; especificidade dobrada |

## Segurança / dados

| Item | Estado | Nota |
|---|---|---|
| Desbloqueio por PIN falhava com `atob() called with invalid base64-encoded data` | **Corrigido, falta confirmar em produção** | `\n` literal da chave do Firebase virava um `n` extra por linha depois do filtro de base64; parsing em `lib/server/private-key-pem.ts` com teste |
| `/api/technicians` devolvia CPF/PIX/endereço de 1.501 pessoas a qualquer logado (inclusive `tecnico`) | **Resolvido** | esses 3 campos agora só para papéis que tratam pagamento/cadastro |
| `CRON_SECRET` apareceu no terminal durante setup | **Resolvido** | rotacionado |

## Infra / migração

| Item | Estado | Nota |
|---|---|---|
| `db:migrate:remote` concatenava todas as migrations (replay de `CREATE TABLE`) | **Resolvido** | agora incremental; aborta se não ler `d1_migrations` |
| Produção antiga no OpenAI Sites ainda ativa | **Pendente (proposital)** | é o rollback; desligar só após dias de estabilidade |
