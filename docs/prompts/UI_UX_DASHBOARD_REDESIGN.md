# Prompt — Redesign UI/UX "Dashboard Premium" do Caju OS

> ⚠️ **Documento histórico — não siga como regra atual.** Os passos 1–7 foram
> implementados em 2026-09-22 e, em 2026-09-23, a revisão de UI/UX
> (`claude/ui-ux-revisao`, ver `docs/CHANGELOG.md`) trocou a direção visual:
> superfícies sólidas, sem gradiente decorativo, glow, glass, sombra em card nem
> orb do assistente. Onde este prompt pedir *glow*, gradiente no card hero, orb,
> `--shadow-card`/`--shadow-hero` ou "pulo" no hover, vale o `CLAUDE.md`/`AGENTS.md`
> e os tokens atuais de `app/globals.css`.

> Prompt para entregar a uma IA de código (Claude Code / Codex) ou a um designer.
> Referência visual: vídeo de @yann.uiux ("Focus Flow"): login em tela dividida azul,
> dashboard em bento-grid com entrada em cascata, gráfico de barras empilhadas
> animado, orb 3D de assistente de IA e alternância claro/escuro animada.
> O objetivo é **trazer essa linguagem visual para o Caju OS** sem mexer em regra
> de negócio.

---

## 0. Papel e restrições (leia antes de tudo)

Você é um(a) engenheiro(a) front-end sênior com olho de product designer. Vai
reestilizar o Caju OS (`operacoes.cajutech.net`) para um visual de dashboard
SaaS premium, limpo e "respirado", com microinterações suaves.

Restrições não negociáveis:

1. **Somente camada visual/UX.** Não altere fluxo Jira, financeiro, produção,
   status, permissões, rotas de API, schema ou migrations
   (ver `docs/WORKFLOW_RULES.md`). Se um ajuste visual exigir mudar dado, pare
   e descreva no PR.
2. Stack existente — não adicione framework novo:
   React 19 + vinext, Tailwind v4 (`app/globals.css` com `@theme inline`),
   componentes shadcn/base-ui em `components/ui/**`, ícones `lucide-react`,
   animação `motion` (`motion/react`), gráficos `recharts`,
   `tw-animate-css`. Runtime Cloudflare Workers (nada de `fs`/libs nativas).
3. Reaproveite os tokens atuais (`--background`, `--card`, `--primary`,
   `--surface-glass`, `--shadow-panel`, `--motion-*`, `--ease-ui`, escala
   `--z-*`). Crie tokens novos **no mesmo arquivo**, nunca cores hex soltas em
   componentes.
4. Preserve o visual premium (regra do projeto). Não simplifique em nome de
   FPS; em vez disso, respeite `prefers-reduced-motion`.
5. O app também roda no Tauri (`src-tauri`) e em celular (Android/Chrome).
   Tudo precisa funcionar de 320 px até 2560 px.
6. Faça em passos pequenos e verificáveis (ver seção 12). Antes de cada commit:
   `npm test`, `npx tsc --noEmit`, `npm run build`.

---

## 1. Direção de arte

**Palavras-chave:** limpo, calmo, confiante, "azul elétrico sobre marfim",
superfícies macias, profundidade sutil, dados como protagonistas.

| Aspecto | Direção |
|---|---|
| Cor de marca | Um único azul saturado (cobalto/elétrico) como cor de ação e de destaque de dados. Todo o resto é neutro. |
| Neutros (claro) | Fundo marfim/cinza-quente muito claro (não branco puro), cards um tom acima, bordas quase invisíveis. |
| Neutros (escuro) | Preto-grafite profundo (quase #000 com leve azul), cards grafite um tom acima, bordas 6–10 % de branco. |
| Profundidade | Sombras longas e difusas de baixa opacidade; o card de destaque azul ganha um *glow* azul embaixo. |
| Densidade | Generosa: padding de card 20–24 px, gap do grid 16–20 px. Nada encostado. |
| Forma | Cantos bem arredondados: cards 20–24 px, botões/pílulas `9999px`, inputs 12 px, barras do gráfico 8–10 px. |
| Tipografia | Geist Sans (já carregada). Títulos semibold, números grandes e tabulares, rótulos pequenos em cinza. |
| Ícones | lucide, traço 1.75, 16–18 px em listas, 20 px em navegação. |

---

## 2. Tokens de design (adicionar em `app/globals.css`)

Hoje o app é **só escuro** (`<html className="dark">` em `app/layout.tsx` e
`color-scheme: dark` em `:root`). Introduza o tema claro sem quebrar o escuro:

1. Mova os valores escuros atuais para `.dark { … }` e crie os claros em
   `:root { … }` (padrão shadcn, compatível com `@custom-variant dark`).
2. Mantenha o **escuro como padrão** na primeira carga (produção já está
   acostumada), com preferência salva por usuário (seção 9).

Tokens novos sugeridos (ajuste para contraste AA):

```css
:root {                       /* claro */
  color-scheme: light;
  --background: #f3f2ee;      /* marfim */
  --foreground: #11141b;
  --card: #fbfaf7;
  --card-elevated: #ffffff;
  --muted: #eceae4;
  --muted-foreground: #6b7080;
  --border: rgb(17 20 27 / 7%);
  --primary: #1f3fff;         /* azul elétrico */
  --primary-foreground: #ffffff;
  --primary-soft: rgb(31 63 255 / 10%);
  --success: #16a34a; --success-soft: rgb(22 163 74 / 12%);
  --danger:  #e5484d; --danger-soft:  rgb(229 72 77 / 12%);
  --chart-track: #dedcd6;     /* coluna "meta" cinza atrás da barra */
  --chart-missed: #ffffff;
  --shadow-card: 0 1px 2px rgb(17 20 27 / 4%), 0 12px 32px -12px rgb(17 20 27 / 12%);
  --shadow-hero: 0 18px 40px -12px rgb(31 63 255 / 55%);
  --radius-card: 1.375rem;
}
.dark {
  color-scheme: dark;
  --background: #07080c;
  --card: #111318;
  --card-elevated: #171a21;
  --muted: #1b1e26;
  --muted-foreground: #8b91a1;
  --border: rgb(255 255 255 / 7%);
  --primary: #2b4bff;
  --chart-track: #2a2d35;
  --chart-missed: #f4f1ea;    /* branco-creme no escuro, como no vídeo */
  --shadow-card: 0 1px 0 rgb(255 255 255 / 4%) inset, 0 16px 40px -16px rgb(0 0 0 / 70%);
  --shadow-hero: 0 18px 48px -12px rgb(43 75 255 / 65%);
  /* manter os demais tokens escuros atuais */
}
```

Exponha os novos no `@theme inline` (`--color-card-elevated`,
`--color-primary-soft`, `--color-success`, `--color-chart-track`, etc.) para usar
`bg-card-elevated`, `text-success`… no Tailwind.

**Contraste:** revalide `--primary-foreground` (o comentário atual diz que
branco no azul antigo dava só 3.7:1 — no azul mais escuro/saturado o branco
deve passar de 4.5:1; confira).

---

## 3. Tela de login (`app/login/page.tsx`)

Layout **split-screen 50/50** no desktop (≥ 1024 px):

**Painel esquerdo — marca**
- Fundo `--primary` com gradiente diagonal sutil (`primary` → 12 % mais escuro).
- Texturas: grid de pontos 6×4 no canto superior esquerdo (opacidade 25 %) e
  onda orgânica SVG na base (duas camadas, 8 % e 14 % de branco).
- Centro: logo do Caju em branco (~96 px), nome "Caju OS" (24 px semibold),
  subtítulo de uma linha em branco 75 % ("Operação de campo, chamados e
  financeiro em um só lugar").
- Indicador de carrossel (3 pontinhos, o ativo vira pílula de 20 px) — opcional,
  alternando frases a cada 5 s.
- Linha de 3 destaques com ícone em traço + rótulo de 2 linhas
  (ex.: "Chamados em tempo real", "Mapa de técnicos", "Acesso seguro").

**Painel direito — formulário**
- Fundo `--background`; card central 400 px, `--card-elevated`,
  `--shadow-card`, raio 20 px, padding 32 px.
- Título "Bem-vindo de volta 👋" (20 px semibold), subtítulo cinza
  "Entre com suas credenciais para continuar".
- Inputs com ícone à esquerda (`Mail`, `Lock`), altura 44 px, fundo `--muted`,
  sem borda aparente; foco = anel de 2 px `--primary` + fundo `--card-elevated`.
  Senha com botão olho (`Eye`/`EyeOff`) acessível (`aria-label`).
- Linha "Lembrar de mim" (checkbox) ↔ "Esqueci a senha" (link azul).
- CTA "Entrar" largura total, 44 px, `--primary`, hover +4 % de luz e
  `translateY(-1px)`, active `scale(.98)`, estado carregando com spinner e
  texto "Entrando…" (desabilitado).
- Divisor "ou entre com" + botão Google (se o provedor Firebase já estiver
  ativo — **não** crie provedor novo; se não existir, omita).
- Mantenha exatamente a lógica atual de autenticação Firebase; só o visual muda.

**Mobile (< 1024 px):** painel azul vira cabeçalho de ~180 px com logo e onda;
card do formulário sobe 24 px por cima (overlap) com cantos superiores
arredondados.

**Transição login → app:** ao autenticar, o card do formulário faz
`opacity 1→0, scale 1→.98` (200 ms) e o painel azul se expande para a tela toda
(`clip-path`/largura, 450 ms, `--ease-ui`) antes de rotear. Com
`prefers-reduced-motion`, apenas fade.

---

## 4. Shell do app (sidebar + topo)

### Sidebar (`components/app-navigation.tsx`)
- Largura 240 px expandida / 72 px recolhida; fundo = `--background` (a sidebar
  "some" no fundo, os cards é que flutuam).
- Topo: logo + "Caju OS" + subtítulo pequeno com a área/perfil
  (ex.: "Operações").
- Botão "Recolher" com ícone `PanelLeftClose`/`PanelLeftOpen`; animação de
  largura 250 ms; rótulos fazem fade/slide de 8 px; em recolhido mostram
  tooltip. Estado salvo em `localStorage` (com try/catch).
- Seção "MENU" (rótulo 11 px, caixa-alta, espaçamento 0.08em, cinza).
- Item: altura 40 px, raio 12 px, ícone 18 px + texto 14 px.
  - Hover: fundo `--muted`.
  - Ativo: fundo `--primary-soft`, texto `--primary`, **barra indicadora de
    3 px à esquerda** que desliza entre itens com `motion` `layoutId`
    (spring `stiffness 500, damping 40`).
- Respeite os itens e permissões atuais (`lib/permissions.ts`); só reestilize.
- Rodapé: avatar 36 px + nome + e-mail/@ truncado + botão sair (`LogOut`).
- Mobile: vira drawer (sheet) acionado por botão no topo; manter
  `--z-sidebar`.

### Barra superior
- Esquerda: saudação dinâmica **"Bom dia / Boa tarde / Boa noite, {primeiro
  nome} 👋"** (20 px semibold) + subtítulo cinza de uma linha com o contexto
  da tela.
- Direita (gap 12 px): **toggle de tema** (seção 9), sino de notificações com
  ponto vermelho de 6 px quando houver não lidas (pulso suave 1× ao chegar),
  botão pílula "Período" com ícone `CalendarDays` que abre o date-range
  existente (se houver na tela).
- Sticky com `--z-sticky`; ao rolar, ganha `backdrop-blur-md` e fundo
  `--background` 80 %.

---

## 5. Dashboard (tela inicial `app/page.tsx`) — bento grid

Grid de 12 colunas no desktop, gap 20 px. Mapeie os blocos da referência para
dados reais do Caju OS (use **apenas** dados que a tela já carrega — não crie
endpoint novo neste trabalho):

| Bloco da referência | No Caju OS | Colunas (xl) |
|---|---|---|
| Card hero azul "Habit Streak Score 92 %" com botões Deposit/Sent | **Card hero**: KPI principal (ex.: SLA do dia ou % de chamados no prazo) + 2 ações pílula (ex.: "Novo chamado", "Ver fila") | 3 |
| "AI Enhancements" com 3 mini-métricas e badges ±% | **Resumo operacional**: 3 mini-KPIs (abertos, em campo, concluídos hoje) com badge de variação vs. ontem | 6 |
| "Habit Score 92 %" com mini-barras | **Mini-sparkline de barras** (últimos 14 dias) com % no canto | 3 |
| "Habit Streak & Consistency" barras empilhadas | **Gráfico principal**: chamados por dia (concluídos × pendentes × meta) | 8 |
| "AI Assistant" com orb | **Assistente** (`components/assistant-panel.tsx`) em card compacto | 4 |
| "Recent Logged Habits" tabela | **Últimos chamados/atividades** (tabela) | 8 |
| "Quick Log" com sliders | **Ações rápidas** (atalhos das ações já existentes) | 4 |

Breakpoints: `xl` como acima; `lg` 2 colunas (hero+sparkline lado a lado,
resumo largura total, gráfico e assistente empilhados); `md`/mobile 1 coluna com
o hero primeiro. Nada de scroll horizontal na página (tabelas rolam dentro do
card).

### 5.1 Card padrão
- `bg-card`, raio `--radius-card`, `--shadow-card`, borda 1 px `--border`,
  padding 20–24 px.
- Cabeçalho: título 15 px semibold + ação à direita (link "Ver tudo" azul
  13 px, ou botão pílula "Últimos 7 dias ▾" com fundo `--muted`).
- Hover (só desktop): sombra aumenta levemente e `translateY(-2px)`, 200 ms.

### 5.2 Card hero azul
- Fundo `--primary` com gradiente radial de luz no canto superior direito
  (branco 18 % → 0) e `--shadow-hero` (o *glow* azul sob o card é marca
  registrada da referência).
- Rótulo branco 70 % (13 px), valor grande branco (32–36 px, bold,
  `tabular-nums`), ícone circular translúcido no canto (32 px, branco 15 %).
- Dois botões pílula: primário branco sólido com texto azul; secundário
  transparente com texto branco e ícone de seta.
- Número faz **count-up** de 0 ao valor em 900 ms (`motion` `animate`
  com `useMotionValue`), só na primeira montagem.

### 5.3 Mini-KPIs
- Cada um em sub-card `--card-elevated` (ou `--muted` no claro), raio 16 px.
- Linha 1: ícone 14 px + rótulo cinza 12 px.
- Linha 2: valor 24 px semibold + unidade pequena cinza ("hrs", "%"),
  e **badge** à direita: pílula 11 px, `+12 %` em `--success` sobre
  `--success-soft`, `-5 %` em `--danger` sobre `--danger-soft`, com seta.

### 5.4 Gráfico principal (recharts `BarChart`)
Reproduza o estilo "coluna com trilho":
- Para cada dia, 3 camadas empilhadas na mesma coluna:
  1. **Base** (valor realizado) — `--primary`, raio 10 px em cima e embaixo.
  2. **Faltou/pendente** — `--chart-missed` (branco no escuro, cinza-claro no
     claro), raio 10 px, separado da base por 4 px de "gap" (use
     `stroke` da cor do card com 4 px ou barras com `stackOffset` + shape
     customizado).
  3. **Meta/trilho** — `--chart-track`, raio 10 px, até o topo da meta.
- `barCategoryGap` ~ 22 %, sem grid vertical, grid horizontal tracejado em
  `--border`, eixos sem linha, ticks 11 px cinza, datas "03 out".
- Legenda superior esquerda com bolinhas quadradas de 8 px:
  "Concluídos · Pendentes · Meta".
- Tooltip: card flutuante `--card-elevated`, raio 12 px, sombra, com os
  3 valores e o dia; cursor = retângulo `--muted` arredondado atrás da coluna.
- **Animação de entrada:** barras crescem de baixo para cima com *stagger* de
  60 ms entre dias (`animationBegin={i*60}`, `animationDuration={700}`,
  `animationEasing="ease-out"`). A camada "meta" aparece primeiro (fade),
  depois a base cresce, depois a pendente.
- Ao trocar período, as barras interpolam de altura (não remontar o gráfico).

### 5.5 Mini-barras (sparkline)
- 14 barras finas (6 px, raio 3 px, gap 4 px); as recentes em `--primary`,
  as futuras/sem dado em `--chart-track`. Legenda "● Real ○ Meta" 11 px.
- % grande no canto superior direito em `--primary`.

### 5.6 Card do assistente
- Orb central 72–88 px: esfera com `radial-gradient` (luz em 30 %/30 %
  de `#9fb2ff` → `--primary` → azul escuro na borda) + sombra azul difusa
  embaixo. Animação idle: flutua 4 px em Y (4 s, ease-in-out, infinito) e
  "respira" `scale 1→1.03`. Enquanto a IA responde: brilho pulsante e rotação
  lenta do highlight.
- Pergunta "Como posso ajudar?" em `--primary` 14 px.
- 3 chips de sugestão (pílula, borda `--border`, ícone 12 px) que
  preenchem o input ao clicar — sugestões ligadas ao Caju OS
  (ex.: "Chamados atrasados hoje", "Resumo do técnico X", "Pendências
  financeiras").
- Input pílula no rodapé: ícone à esquerda, placeholder "Pergunte algo…",
  microfone, botão "Enviar" azul compacto.
- Reaproveite toda a lógica do `assistant-panel.tsx`. O assistente já é global
  (`components/global-assistant.tsx`, montado no `RootLayout`): o card do
  dashboard **não** cria uma segunda instância — ele só abre/alimenta o painel
  global (mesmo histórico), e o botão flutuante ganha o mesmo orb.

### 5.7 Tabela de atividades recentes
- Cabeçalho 12 px cinza sem fundo; linhas 56 px com divisor `--border`.
- Colunas: Nome (semibold) · Categoria · Data e hora (2 linhas: data + hora
  cinza) · Duração/valor (verde se positivo, vermelho se negativo) · Status.
- Status em pílula: "Concluído" `--success-soft`/`--success`, "Pendente"
  âmbar, "Atrasado" `--danger`.
- Hover da linha: fundo `--muted` 60 %. Linha inteira clicável quando já
  existir destino. Mobile: vira lista de cards (nome + status em cima,
  metadados embaixo).

### 5.8 Ações rápidas
- Linhas com avatar-letra colorido (círculo 28 px, fundo soft da cor),
  rótulo + seletor `▾`, valor à direita e um controle (slider/stepper) com
  *thumb* quadrado azul arredondado 20 px.
- Só atalhos para ações que já existem; nada de lógica nova.

---

## 6. Coreografia de carregamento (o "wow" do vídeo)

Sequência ao entrar no dashboard (total ≤ 1.2 s):

1. **0 ms** — shell (sidebar + topo) já visível; cards aparecem como
   *skeletons* "fantasmas" (retângulos `--muted` com shimmer diagonal de 1.4 s),
   nas posições finais — layout nunca pula (sem CLS).
2. **80 ms** — card hero entra: `opacity 0→1, y 12→0, scale .98→1`,
   spring (`stiffness 260, damping 26`).
3. **+70 ms cada** — demais cards em *stagger* na ordem de leitura
   (esquerda→direita, cima→baixo), mesmo movimento. Use `motion` com
   `variants` + `staggerChildren: 0.07`.
4. Conteúdo interno entra quando o dado chega: números fazem count-up,
   barras crescem (5.4), badges fazem `scale .8→1`.
5. Se o dado já estiver em cache, pule os skeletons e rode só o stagger
   (máx. 400 ms) — nunca atrase dado pronto por causa de animação.

Reaproveite `components/caju-loading.tsx` só para a carga inicial do app
(antes do shell), não dentro dos cards.

---

## 7. Microinterações (inventário)

| Elemento | Interação |
|---|---|
| Botões | hover: +luz e `y -1px`; active: `scale .98`; foco: anel 2 px `--ring` com offset 2 px |
| Cards | hover: sombra ↑ e `y -2px` (desktop, ponteiro fino apenas: `@media (hover:hover)`) |
| Item de menu ativo | barra lateral desliza com `layoutId` |
| Sidebar recolher | largura anima, rótulos em fade, ícone gira 180° |
| Sino | ao chegar notificação: `rotate` ±12° 2× + ponto pulsa |
| Badges ±% | entram com `scale` e seta sobe/desce 2 px |
| Números | count-up na primeira exibição; em atualização, "roll" curto (200 ms) |
| Gráfico | crescimento em stagger; tooltip segue o cursor com `transition` 120 ms |
| Orb IA | flutuar/respirar idle; pulsar ao pensar |
| Toggle de tema | ver seção 9 |
| Toasts | entram da direita-baixo com spring; progresso fino azul no rodapé |

Durações: `--motion-fast` 150 ms (hover/press), `--motion-standard`
200 ms (estado), 250–450 ms (layout/tema), nunca > 900 ms exceto count-up.
Easing padrão `--ease-ui`.

**Reduced motion:** com `prefers-reduced-motion: reduce` (e com
`MotionConfig reducedMotion="user"` na raiz), desligue translate/scale/
shimmer/flutuação; mantenha só fades ≤ 150 ms. Números aparecem já no valor
final.

---

## 8. Estados

Cada card precisa dos 4 estados desenhados:
- **Carregando:** skeleton com a forma do conteúdo final.
- **Vazio:** ícone lucide 32 px em círculo `--muted`, frase curta útil
  ("Nenhum chamado hoje — bom sinal 🎉") e, se fizer sentido, uma ação.
- **Erro:** mensagem curta + botão "Tentar de novo"; o erro de um card
  **nunca** derruba os outros (error boundary por card).
- **Offline / dado antigo:** selo discreto "Atualizado há 5 min" em cinza.

Falhas de conveniência (OCR, geocode, TURN, IA) nunca bloqueiam o fluxo
principal — o card do assistente mostra estado de erro próprio.

---

## 9. Tema claro/escuro

- Toggle pílula 52×28 px no topo: trilho `--muted`, *thumb* circular 22 px
  com ícone `Sun`/`Moon` que gira 90° e troca com crossfade; thumb desliza com
  spring.
- Transição de tema: use a **View Transitions API**
  (`document.startViewTransition`) com um círculo que se expande a partir do
  toggle (`clip-path: circle()` 450 ms). Fallback sem suporte: troca direta
  com `transition: background-color, color 250ms` nos elementos de superfície
  (não em `*`, para não pesar).
- Persistência: `localStorage` (`caju-theme`: `dark | light | system`), leitura
  com try/catch. Aplique a classe no `<html>` **antes da hidratação** com um
  script inline mínimo em `app/layout.tsx` para evitar flash.
- No Tauri, sincronize a cor da barra de janela (`desktop-window-controls.tsx`)
  com o tema, se for trivial; senão, anote no PR.
- Revise telas que hoje assumem fundo escuro (mapa Leaflet, zoom de imagem,
  chat, WhatsApp, financeiro) e ajuste cores fixas para tokens. Onde o tema
  claro ficar ruim, force `dark` localmente e anote no PR.

---

## 10. Acessibilidade

- Contraste AA em ambos os temas (texto ≥ 4.5:1, UI/ícones ≥ 3:1). Valide os
  cinzas de `--muted-foreground` sobre `--card` nos dois temas.
- Navegação completa por teclado; foco sempre visível; ordem de tab = ordem
  visual; atalho para recolher sidebar opcional (`[`).
- Gráficos com `role="img"` + `aria-label` resumindo a tendência, e tabela
  equivalente acessível (visually-hidden) ou botão "Ver como tabela".
- Badges de variação não dependem só de cor: sinal `+`/`-` e seta.
- Alvos de toque ≥ 44 px no mobile.
- `lang="pt-BR"` e textos em português do Brasil em toda a UI.

---

## 11. Performance

- Animar apenas `transform`, `opacity`, `clip-path` (nada de `height`/`width`
  em loop; a sidebar pode animar largura por ser pontual).
- `will-change` só durante a animação.
- Recharts: memoize dados e formatadores; `isAnimationActive` falso em
  atualizações em tempo real frequentes.
- Orb em CSS puro (gradientes), sem WebGL/imagens pesadas.
- Nenhuma dependência nova sem justificar no PR.

---

## 12. Plano de entrega (um PR por passo, branch `claude/…`)

1. **Tokens + tema claro** (`globals.css`, `layout.tsx`, toggle) — sem mudar
   layout. Verificar todas as telas nos 2 temas.
2. **Shell**: sidebar recolhível com indicador animado + barra superior com
   saudação.
3. **Login** split-screen + transição para o app.
4. **Dashboard bento**: cards, hero, mini-KPIs, sparkline, tabela, ações
   rápidas (com dados já existentes).
5. **Gráfico principal** estilo trilho + animações.
6. **Card do assistente** com orb.
7. **Coreografia de carregamento** + estados vazio/erro + reduced motion.
8. Passe de acessibilidade e responsividade (320, 390, 768, 1024, 1440,
   1920 px) nos dois temas.

Em cada passo:
- `npm test`, `npx tsc --noEmit`, `npm run build` verdes.
- Screenshots antes/depois (claro e escuro, desktop e mobile) no PR.
- `docs/CHANGELOG.md` atualizado; `git add` por caminho.

## 13. Critérios de aceite

- [ ] Nenhuma mudança em regra de negócio, API, schema ou permissões.
- [ ] Tema claro e escuro completos, sem flash na carga, preferência salva.
- [ ] Login split-screen idêntico em espírito à referência, responsivo.
- [ ] Dashboard em bento grid com card hero azul com glow, mini-KPIs com
      badges, gráfico de barras com trilho, assistente com orb, tabela e ações
      rápidas.
- [ ] Entrada em cascata dos cards + crescimento das barras em ≤ 1.2 s, sem
      layout shift.
- [ ] `prefers-reduced-motion` respeitado.
- [ ] AA de contraste nos dois temas; teclado ok; alvos 44 px no mobile.
- [ ] Sem scroll horizontal da página em 320 px.
- [ ] Testes, typecheck e build passando.
