# Proposta: Solicitações da gerência e Checklist de prioridades

Rascunho para validar com o chefe antes de implementar (áudios 23 e 24 de 30/09).

## 1. Solicitações (do áudio 23)

**Problema:** hoje o chefe recebe um pedido (ex.: atender em Ipojuca um cliente que não é a Americanas), repassa no
grupo, e a equipe cria o grupo, acha o técnico, define o dia e avisa de volta. Nada disso fica no sistema.

**Como funcionaria**
1. *Quem pede* (gerência/coordenação) abre **Operação > Solicitações > Nova** e preenche: cliente, cidade/UF, loja ou
   endereço, o que foi pedido, prazo desejado, prioridade e anexos (foto, print da conversa).
2. A solicitação entra na fila **Nova**. Quem da equipe assume (analista) vira o responsável.
3. A solicitação tem um passo a passo (checklist) que o sistema ajuda a cumprir:
   - **Criar o grupo no WhatsApp** (botão): nome no padrão do grupo (`dd/mm às hh:mm - CIDADE/UF - CLIENTE LOJA (ref)`).
   - **Escolher o técnico**: lista só com técnicos da mesma cidade (mesma regra da distribuição), com opção de oferecer
     pelo WhatsApp como nos chamados.
   - **Definir dia e hora.**
   - **Devolver**: o solicitante recebe o resumo (técnico, dia, link do grupo) por notificação no app e, se quiser, no WhatsApp.
4. Estados: Nova → Em andamento → Grupo criado → Técnico definido → Agendada → Devolvida. Cada passo fica registrado
   (quem fez e quando).
5. No app, as solicitações aparecem como cartão com o mesmo passo a passo.

**Dados:** tabela `solicitations` (pedido, responsável, técnico, agendamento, grupo do WhatsApp, estado) e
`solicitation_events` (histórico). Anexos no mesmo armazenamento dos anexos de chamado.

**Perguntas para o chefe**
- Clientes que não são Americanas têm chamado no Jira, ou a solicitação é só interna?
- Quem pode pedir (só gerência/coordenação ou também analista)?
- O solicitante quer ser avisado em qual canal (app, WhatsApp, os dois)?
- Prazo padrão para devolver (ex.: 2 h)? O sistema pode alertar se passar.

## 2. Checklist de prioridades por colaborador (do áudio 24)

**Problema:** cada pessoa decide sozinha o que fazer primeiro. O chefe quer que o sistema diga, por função, qual é a
prioridade agora (ex.: sem agendamento pendente → responder quem está sem resposta no WhatsApp; técnico em campo há
mais de 3 h sem subir fotos → isso passa na frente).

**Como funcionaria**
- Um cartão **"Minha prioridade agora"** na Visão geral (e no app) com a lista ordenada do que fazer, calculada com os
  dados reais. Cada item mostra a quantidade, o mais antigo e leva direto à tela certa.
- O sistema marca o primeiro item como **Agora**; ao zerar, sobe o próximo.
- A ordem e as regras são **por função** (analista, coordenador, N1...) e a gerência pode ajustar a ordem.

**Regras iniciais (a confirmar com a lista que o chefe mandou):**
1. Chamados novos pendentes de agendamento (mais antigos primeiro).
2. Chamados aceitos pelo técnico e ainda sem agenda.
3. Pessoas esperando resposta no WhatsApp (não lidas há mais de X minutos).
4. Técnico em campo há mais de 3 h sem fotos/RAT subidos.
5. Ofertas retidas (cidade sem técnico) e ofertas sem aceite.
6. Aguardando spare parado.
7. Chamados com prazo vencendo.

**Alertas com prioridade (parte do áudio 25):** os alertas do sino ganham nível (urgente / alto / normal) e são
filtrados por função, usando as mesmas regras.

**Dados:** as regras leem o que já existe (fila do Jira, conversas do WhatsApp, ofertas, presença). Só a **ordem por
função** precisa de tabela (`priority_rules`).

**Preciso do chefe:** a lista de prioridades que ele mandou antes (não está no sistema), com a ordem para cada função e
os limites de tempo (3 h, X minutos...).

## Ordem sugerida de implementação
1. Checklist v1 com regras fixas e cartão na Visão geral (rápido, usa dados existentes).
2. Alertas com nível e filtro por função.
3. Solicitações (tela, estados, criação do grupo, devolução).
4. Ordem de prioridades editável pela gerência.
