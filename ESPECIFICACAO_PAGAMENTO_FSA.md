# Regras de Pagamento dos Técnicos

**Data**: 18 de setembro de 2026  
**Status**: Aguardando sua confirmação

---

## O que é isso?

Este documento mostra como calcular quanto pagar cada técnico pelas suas visitas às lojas. O sistema Caju vai fazer isso automaticamente.

## Como funciona?

Cada visita do técnico vai ter **chamados** (tarefas):
- **Chamados normais**: quando o técnico conserta/resolve algo (conserto de máquina, configuração, etc.)
- **FSAs de evidência**: quando a FSA exige evidências, como uma ou várias fotos/comprovantes
- **Chamados que não conseguiu resolver**: quando não conseguiu fazer por algum motivo (loja fechada, máquina muito quebrada, etc.)

O técnico pode mudar a classificação de um chamado a qualquer momento, e o preço é recalculado automaticamente.

---

## O que o sistema vai guardar?

Para cada chamado, o sistema vai registrar:

- **Tipo da FSA**: Se é serviço (conserto) ou evidência
- **Improdutivo?**: Se conseguiu resolver ou não
- **Por quê não conseguiu?**: Qual foi o motivo (loja fechada, máquina com defeito maior, etc.)
- **Observações extras**: Detalhes adicionais que o técnico quer registrar
- **Quanto pagar**: O valor calculado automaticamente
- **Status do pagamento**: Se está pronto para pagar, aprovado, pago ou bloqueado
- **Histórico**: Rastreamento de tudo que mudou (para auditoria)

---

## Quanto pagar por serviço (conserto)?

Quanto mais serviços o técnico faz em uma visita, mais ele ganha:

| Quantidade de Serviços | Valor |
|-----------|-------|
| 1 | R$ 70 |
| 2 | R$ 100 |
| 3 | R$ 120 |
| 4 | R$ 150 |
| 5 | R$ 150 |
| 6 | R$ 180 |
| 7 | R$ 210 |
| 8 | R$ 240 |
| 9 | R$ 270 |
| 10 | R$ 300 |
| 11 | R$ 330 |

**E se tiver mais de 11?** Cada serviço adicional vale R$ 30 a mais (exemplo: 12 = R$ 360, 13 = R$ 390, e assim vai).

---

## Quando aparecem serviços novos na loja?

Se o técnico chega à loja agendado para fazer 4 serviços, mas ao chegar descobre que precisa fazer mais 1, ele ganha um **bônus de R$ 30** por cada novo serviço descoberto.

**Exemplo prático:**
- Técnico é agendado para 4 serviços = R$ 150
- Chega lá e aparece mais 1 serviço = R$ 150 + R$ 30 = **R$ 180**

Isso vale para cada novo serviço que aparecer, sem limite máximo.

---

## Quanto pagar por evidências?

Se o técnico atende **somente FSAs de evidência** (sem fazer serviço):

| Quantidade de FSAs de Evidência | Valor |
|-----------|-------|
| 1 a 14 FSAs | R$ 70 |
| 15 FSAs | R$ 75 |
| 16 FSAs | R$ 80 |
| 17 FSAs | R$ 85 |
| 18 FSAs | R$ 90 |

**A partir da 15ª FSA de evidência**, cada FSA adicional vale R$ 5 (ex.: 19 FSAs = R$ 95, 20 FSAs = R$ 100).

**Importante:** a contagem é por FSA, não por foto. Uma FSA continua valendo uma evidência mesmo quando possui várias fotos ou comprovantes.

### Quando tem serviço E evidência?

Se o técnico atende FSAs de serviço e FSAs de evidência na mesma visita, a gente soma os dois:
- **Valor dos serviços**: Segue a tabela normal (R$ 70, R$ 100, etc.)
- **Valor das evidências**: R$ 5 por cada FSA de evidência
- **Total**: Valor do serviço + (quantidade de FSAs de evidência × R$ 5)

**Exemplos:**

**Caso 1:** 1 serviço + 9 FSAs de evidência
- Serviço: R$ 70
- Evidências: 9 FSAs × R$ 5 = R$ 45
- **Total: R$ 115**

**Caso 2:** 3 serviços + 8 FSAs de evidência
- Serviço: R$ 120
- Evidências: 8 FSAs × R$ 5 = R$ 40
- **Total: R$ 160**

---

## Quando não consegue resolver (improdutivo)?

Um chamado é marcado como **não conseguiu resolver** quando:

1. O gerente da loja não deixou o técnico fazer o trabalho
2. Máquina com defeito que não dá pra consertar na hora (vai pra manutenção maior)
3. Tem outro problema que impede resolver o principal
4. A loja estava fechada
5. Passaram mais de 2 horas tentando resolver um único problema e ainda não saiu
6. A loja estava perto de fechar (últimos 30 minutos)

### Quanto pagar quando não consegue resolver?

Quando não consegue resolver, o técnico ganha **metade** do valor que ganharia se tivesse resolvido.

**Exemplos práticos:**

**Caso 1:** 1 serviço e não conseguiu resolver
- Normal custaria: R$ 70
- Sem resolver: R$ 70 ÷ 2 = **R$ 35**

**Caso 2:** 2 serviços, 1 resolvido e 1 não
- Normal custaria: R$ 100
- Resolvido: R$ 50
- Não resolvido: R$ 50 ÷ 2 = R$ 25
- **Total: R$ 75**

**Caso 3:** 3 serviços, 2 resolvidos e 1 não
- Normal custaria: R$ 120 (R$ 40 por serviço)
- Resolvidos: R$ 40 + R$ 40 = R$ 80
- Não resolvido: R$ 40 ÷ 2 = R$ 20
- **Total: R$ 100**

### Quando uma FSA de evidência vira serviço?

Se começou marcada como "evidência" e depois virou "serviço", o sistema recalcula automaticamente.

**Exemplo:** Eram 10 FSAs de evidência (R$ 70), mas 1 delas virou serviço
- Antes: R$ 70
- Depois: R$ 70 (serviço) + R$ 45 (9 FSAs de evidência × R$ 5) = **R$ 115**

---

## Como funciona o fluxo de pagamento?

### Passo a passo:

1. **Técnico é agendado** com algumas FSAs de serviço/evidência planejadas

2. **Durante a visita**, o técnico pode:
   - Adicionar novas FSAs de serviço/evidência
   - Mudar uma FSA de "evidência" para "serviço" (ou vice-versa)
   - Marcar como "não conseguiu resolver" e explicar o motivo

3. **Sistema calcula automaticamente** o valor a cada mudança

4. **Atendimento fica pronto para pagar** — o sistema guardou o valor final

5. **Gerente aprova** — revisa o valor e confirma se está ok

6. **Técnico recebe o pagamento** após aprovação

### Se mudar de ideia depois?

Se o técnico marcou a FSA como "evidência" mas depois muda para "serviço", o sistema:
- Bloqueia a mudança temporariamente
- Gerente precisa revisar e confirmar a mudança
- Valor é recalculado automaticamente

### O sistema guarda tudo?

Sim! Cada mudança é registrada (quando foi, o que mudou, quem mudou) para não ter dúvidas depois.

---

## Como fica na tela?

### Marcando como "não conseguiu resolver"

Ao clicar num chamado, tem um botão para marcar como "não conseguiu resolver". Quando marca, precisa escolher:
- O motivo (gerente recusou, máquina com defeito, loja fechada, etc.)
- Opcionalmente, deixar uma observação (ex: "máquina soltando fumaça, marcado para manutenção")

### Vendo quanto vai ganhar

Quando o técnico clica em um chamado (ou grupo de chamados), vê:
- Quanto ganhou com serviços
- Quanto ganhou com FSAs de evidência
- Quanto vai descontar por não conseguir resolver
- **O total final que vai receber**

### Várias visitas no mesmo dia

Se o técnico faz 3 visitas a lojas diferentes no mesmo dia:
- O sistema mostra cada visita separadamente
- Mas também soma tudo em um "resumo do dia"
- Exemplo: se fez 4 + 3 + 2 = 9 serviços em total, o sistema calcula como se fossem 9 serviços em uma única visita

### Relatório para exportar

O gerente pode gerar um relatório (arquivo PDF ou Excel) mostrando:
- Data
- Técnico
- Cada FSA (se era serviço ou evidência, se conseguiu resolver)
- Como foi calculado
- Quanto vai receber
- Se já foi aprovado ou ainda está pendente

---

## Onde os dados ficam guardados?

### De onde vêm os chamados?

Os chamados começam no Jira (sistema de tickets antigo), mas o Caju Monitor faz uma cópia para usar.

### Mudanças que o técnico faz

Quando o técnico marca como "serviço", "evidência" ou "não conseguiu resolver", isso fica **só no Caju Monitor** — não volta pro Jira.

### Onde o Caju guarda tudo?

Tudo fica guardado no banco de dados do Caju Monitor, de forma segura e com histórico completo.

### Como o dinheiro sai?

O gerente exporta um relatório do Caju e envia pra folha de pagamento normalmente. O Caju não faz pagamento automaticamente (fica só como cálculo e aprovação).

---

## Regras que o sistema vai seguir

1. **Cada FSA precisa ser classificada** — não pode deixar indefinido ("é serviço ou é evidência?")
2. **Se não conseguiu resolver, precisa explicar o motivo** — não pode deixar em branco
3. **Pode ter uma visita inteira sem conseguir resolver nada** — não tem problema, o sistema permite
4. **Pode mudar de ideia a qualquer hora** — o sistema recalcula automaticamente
5. **Sem limite de chamados** — pode ter 100, 1000, o cálculo funciona para qualquer quantidade

---

## Exemplo prático para testar

**Situação real:**

O técnico é agendado para fazer:
- 2 serviços
- 2 FSAs de evidência
- Valor esperado: R$ 100 (serviços) + R$ 10 (evidências) = **R$ 110**

**Na loja:**
- Descobre +1 serviço novo = +R$ 30 (bônus por aparecer na hora)
- Descobre +2 FSAs de evidência = +R$ 10
- Novo subtotal: R$ 110 + R$ 30 + R$ 10 = **R$ 150**

**Depois:**
- Um dos 2 serviços originais não conseguiu resolver (máquina com defeito maior)
- Agora tem:
  - 3 serviços no total (2 resolvidos + 1 não)
  - Valor normal para 3 serviços: R$ 120
  - Como 1 não foi resolvido: R$ 120 ÷ 3 = R$ 40 cada, então R$ 40 ÷ 2 = R$ 20 (o que não resolveu)
  - Ganho com serviços: R$ 40 + R$ 40 + R$ 20 = **R$ 100**
- Evidências: 4 FSAs × R$ 5 = **R$ 20**

**Valor final que o técnico recebe: R$ 100 + R$ 20 = R$ 120**

---

## Próximos passos (para o time técnico)

- Criar a função que calcula o valor automaticamente
- Guardar os dados com histórico completo
- Criar as telas para o técnico marcar e para o gerente aprovar
- Escrever testes com os exemplos acima

---

## Confirmação do chefe

Você concorda com **TODAS** estas regras?

- [ ] Serviços: R$ 70, R$ 100, R$ 120... até R$ 330, depois +R$ 30 por serviço adicional
- [ ] FSAs de evidência sozinhas: R$ 70 até 14 FSAs, depois +R$ 5 por FSA adicional
- [ ] Serviço + evidência: preço do serviço + (quantidade de FSAs de evidência × R$ 5)
- [ ] Novo serviço que aparece na loja: +R$ 30 por serviço
- [ ] Não conseguiu resolver: metade do valor normal
- [ ] Motivo obrigatório quando não consegue resolver
- [ ] Pode não conseguir resolver nada (visita inteira "branca")
- [ ] Sem limite máximo de FSAs de serviço/evidência
- [ ] Tudo é rastreado (histórico completo)
- [ ] Cada técnico pode ter múltiplas visitas no mesmo dia
- [ ] Gerente aprova antes de pagar
- [ ] Exemplo final deve dar R$ 120 (confira o cálculo acima)

---

**Data**: _______________  
**Confirmado por**: _______________

