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
| Diálogo do chamado diz "Rastreio salvo e monitorado", mas só parte desses rastreios é consultada | **Parcial** | códigos ligados a um spare ativo são consultados pelo cron (`/api/spares/tracking`, a cada 6 h por código até "Entregue"); código digitado só no diálogo, sem spare correspondente, continua sem consulta |

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
| `bitmap.close()` antes de ler `width/height` → toda foto reportava 0x0 e o upload era bloqueado | **Resolvido** | `components/jira-ticket-details.tsx` — lê as dimensões antes do `close()` |
| Chave do Google Maps com `&v=weekly` colado no valor | **Resolvido** | era o secret; irrelevante agora (mapa é Leaflet) |
| Duas validações de foto divergentes (avisa vs. bloqueia) | **Resolvido** | `lib/image-validation.ts` virou fonte única; N1 avisa, upload ao Jira bloqueia usando o mesmo motor |
| Histórico de `ticket_evidence` e `employee_messages` não migrou do OpenAI Sites | **Pendente (perda aceita)** | não havia endpoint de leitura na produção antiga |

## Mapa e busca de técnico

| Item | Estado | Nota |
|---|---|---|
| Mapa (Google) não renderizava tiles, sem erro | **Resolvido** | migrado para **Leaflet + OpenStreetMap**; sem chave/cota |
| Buscar cidade sem técnico não mostrava ninguém | **Resolvido** | geocodifica via `/api/geocode` (Nominatim + cache) e lista os mais próximos |
| Raio de 55 km escondia todos quando ninguém estava dentro | **Resolvido** | virou faixa de destaque; fallback mostra os 8 mais próximos |
| Distância é estimada por faixas, não real | **Pendente (limitação)** | técnicos não têm lat/lng no banco; custo de deslocamento em R$ é aproximado |
| Cruzamento técnico ↔ cadastro por nome+cidade pode falhar | **Validar em produção** | grafia diferente (abreviação, "junior" vs "Jr") → telefone não aparece no painel |

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
| `/api/technicians` devolvia CPF/PIX/endereço de 1.501 pessoas a qualquer logado (inclusive `tecnico`) | **Resolvido** | esses 3 campos agora só para papéis que tratam pagamento/cadastro |
| `CRON_SECRET` apareceu no terminal durante setup | **Resolvido** | rotacionado |

## Infra / migração

| Item | Estado | Nota |
|---|---|---|
| `db:migrate:remote` concatenava todas as migrations (replay de `CREATE TABLE`) | **Resolvido** | agora incremental; aborta se não ler `d1_migrations` |
| Produção antiga no OpenAI Sites ainda ativa | **Pendente (proposital)** | é o rollback; desligar só após dias de estabilidade |
