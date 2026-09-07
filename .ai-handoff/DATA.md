# Banco de dados e histórico

O esquema está em `db/schema.ts`; a configuração Drizzle está em `drizzle.config.ts`; migrations versionadas estão em `drizzle/`.

## Grupos de tabelas

- Identidade e presença: `app_users`, `employee_presence`, `communication_preferences`.
- Jira/cache: `tickets`, `ticket_history`, `jira_issue_links`, `jira_sync_jobs`.
- Comunicação: `employee_messages`, grupos/membros/mensagens/leitura/digitação e `voice_call_history`.
- Operação: `operational_stores`, `operational_workflows`, `operational_visits`, `n1_ticket_assignments`, `ticket_evidence`.
- Governança: `operational_audit`, `ticket_snapshots`, `requester_history`, `employee_activity`.
- Logística e tarefas: `shipment_tracking`, `operational_tasks`.
- Financeiro: `finance_settings` e regras relacionadas nas APIs.
- Técnicos: `technicians`, `technician_reviews`.

Última migration criada: `drizzle/0014_tough_jack_flag.sql`.

## Regras

- Nunca edite uma migration já aplicada; crie outra com `npm run db:generate`.
- Inclua a pasta `drizzle/` no pacote de Sites para que migrations sejam aplicadas no deploy.
- Mudanças importantes de chamado devem gerar auditoria e snapshot anterior.
- O endpoint de exportação administrativa fica em `app/api/admin/export/route.ts`.

