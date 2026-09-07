# Pendências e limites conhecidos

Itens abaixo não devem ser descritos como totalmente resolvidos sem validação adicional:

1. Comentários e retirada de fila usam atualização periódica. Para “tempo real” verdadeiro, configurar webhooks do Jira com autenticação, idempotência e rota receptora.
2. Rastreamento tem cadastro, previsão e alertas, mas atualização automática da transportadora exige API/credencial de cada transportadora.
3. Precificação automática por categoria usa regras/heurísticas atuais. Migrar para uma tabela administrativa editável, versionada e auditável.
4. Compartilhamento de tela e chamadas precisam de teste E2E com dois computadores, redes distintas, TURN e permissões reais de Windows/Chrome.
5. Restauração de snapshot carrega dados anteriores para revisão; confirmar o salvamento e a sincronização Jira faz parte do fluxo.
6. O objetivo “60 FPS” não é uma garantia mensurável em todo hardware. O usuário preferiu preservar o visual. Perfil de desempenho futuro deve otimizar rerenders, listas e consultas sem remover acabamento.
7. Validar regras de privacidade, consentimento, retenção e acesso antes de ampliar monitoramento de atividade de colaboradores.
8. A planilha de requisitos original está em `C:\Users\Lohan Dias\Downloads\FUNCIONALIDADES DO SISTEMA.xlsx`. Revisar cada linha contra este inventário antes de declarar cobertura integral.

## Próximas prioridades sugeridas

- Webhook Jira + fila idempotente de eventos.
- Testes automatizados das transições com campos obrigatórios e telas diferentes.
- Teste Playwright do Kanban, agenda, técnico, valores, anexos e validação.
- Painel administrativo para preços, transportadoras, regras de alerta e retenção.
- Observabilidade: erros por endpoint, latência Jira, falhas de sync e qualidade de chamada.

