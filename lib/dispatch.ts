// Distribuição de chamados por WhatsApp (docs/DISPATCH_WHATSAPP.md).
//
// Um chamado novo vira uma oferta para todos os técnicos elegíveis da cidade;
// FSAs da mesma loja saem juntos numa oferta só. O primeiro técnico que tocar
// em "Aceitar atendimento" fica com todos os FSAs da oferta — a disputa é
// resolvida no banco (ACCEPT_OFFER_SQL), não na ordem das mensagens.
//
// Tudo aqui é puro (sem banco, sem rede) para os testes. Sem import de valor de
// outro módulo: os testes rodam com strip-types, que não resolve caminho sem
// extensão.

export const DISPATCH_MODES = ['off', 'dry_run', 'allowlist', 'live'] as const;
export type DispatchMode = (typeof DISPATCH_MODES)[number];

/** Sem configuração explícita, nada acontece: nem oferta, nem mensagem. */
export function dispatchModeOf(value: string | undefined | null): DispatchMode {
  const v = value?.trim().toLowerCase();
  return (DISPATCH_MODES as readonly string[]).includes(v ?? '') ? (v as DispatchMode) : 'off';
}

/** Por quanto tempo uma oferta fica aberta (pendência 4 da especificação: 2 h até decisão contrária). */
export const OFFER_HOURS = 2;
/** Na primeira ligada, não oferecer a fila antiga inteira: só o que entrou nestas horas. */
export const LOOKBACK_HOURS = 24;

// ─── Normalização ──────────────────────────────────────
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Código da loja estável para agrupar: "Loja 330", "L330" e "330" são a mesma loja. */
export function storeKeyOf(code: string | null | undefined): string | null {
  const raw = (code ?? '').trim().replace(/^loja\s+/i, '');
  if (!raw) return null;
  const digits = raw.match(/^[a-z]?\s*0*(\d+)$/i)?.[1];
  return digits ? `L${digits}` : fold(raw).toUpperCase();
}

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

/** "Patos de Minas/MG", "Patos de Minas - MG", "Patos de Minas, MG" → cidade e UF. */
export function splitCity(value: string | null | undefined): { city: string; uf: string | null } {
  const v = (value ?? '').trim();
  const m = v.match(/^(.*?)[\s]*[/,\-][\s]*([A-Za-z]{2})$/);
  if (m && UFS.has(m[2].toUpperCase())) return { city: m[1].trim(), uf: m[2].toUpperCase() };
  return { city: v, uf: null };
}

/** Telefone do cadastro em dígitos com DDI 55, como o WhatsApp identifica o remetente. */
export function whatsappPhone(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return null;
  const withCountry = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
  return withCountry.length >= 12 && withCountry.length <= 13 ? withCountry : null;
}

/**
 * O mesmo número pode chegar com ou sem o nono dígito (o WhatsApp às vezes
 * devolve o formato antigo). Compara pelo DDD + últimos 8 dígitos.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined) {
  const pa = whatsappPhone(a);
  const pb = whatsappPhone(b);
  if (!pa || !pb) return false;
  const key = (p: string) => `${p.slice(2, 4)}${p.slice(-8)}`;
  return key(pa) === key(pb);
}

// ─── Chamados candidatos ───────────────────────────────
export type DispatchTicket = {
  key: string;
  storeCode: string | null;
  storeName: string | null;
  /** Como vem do Jira: "Patos de Minas/MG" ou só a cidade. */
  city: string | null;
  equipment: string | null;
  pdv: string | null;
  /** Campo "Defeito alegado" do Jira. Nunca substituído pela categoria ou título. */
  allegedDefect: string | null;
};

export type HoldReason = 'sem_loja' | 'sem_cidade' | 'sem_defeito' | 'sem_tecnico';
export const HOLD_LABEL: Record<HoldReason, string> = {
  sem_loja: 'Chamado sem código de loja no Jira',
  sem_cidade: 'Chamado sem cidade no Jira',
  sem_defeito: 'Defeito alegado vazio no Jira',
  sem_tecnico: 'Nenhum técnico elegível na cidade',
};

export type OfferGroup = { storeKey: string; tickets: DispatchTicket[] };

/**
 * Um grupo por loja (identidade estável, não o texto do nome). Lojas diferentes
 * nunca se juntam, mesmo na mesma cidade. Chamado sem código de loja fica
 * sozinho, para não juntar lojas por engano.
 */
export function groupByStore(tickets: DispatchTicket[]): OfferGroup[] {
  const groups = new Map<string, DispatchTicket[]>();
  for (const t of tickets) {
    const storeKey = storeKeyOf(t.storeCode) ?? `sem-loja:${t.key}`;
    groups.set(storeKey, [...(groups.get(storeKey) ?? []), t]);
  }
  return [...groups].map(([storeKey, list]) => ({ storeKey, tickets: [...list].sort((a, b) => a.key.localeCompare(b.key)) }));
}

// ─── Técnicos elegíveis ────────────────────────────────
export type DispatchTechnician = {
  id: number; name: string; phone: string | null; approved: boolean;
  baseCity: string; baseState: string; extraCities: string | null;
};

/**
 * Só os técnicos da MESMA cidade do chamado (a cidade base do cadastro), com
 * cadastro aprovado e telefone válido para WhatsApp. "Outras cidades" do
 * cadastro não contam: um técnico de Timbaúba com dezenas de cidades listadas
 * recebia chamados de todas elas. Sem técnico na cidade, a oferta fica retida
 * e a equipe é avisada (sem_tecnico); nada é enviado a cidade vizinha.
 * O `status` (online/ocupado) não entra: ninguém o mantém atualizado.
 */
export function eligibleTechnicians(techs: DispatchTechnician[], city: string, uf: string | null): DispatchTechnician[] {
  const target = fold(city);
  if (!target) return [];
  return techs.filter((t) => {
    if (!t.approved || !whatsappPhone(t.phone)) return false;
    return fold(t.baseCity) === target && (!uf || !t.baseState || t.baseState.trim().toUpperCase() === uf);
  });
}

// ─── Mensagem ──────────────────────────────────────────
/** Variável de template da Meta: sem quebra de linha, tab ou mais de 4 espaços. */
export function templateParam(value: string, max = 160): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function storeLine(t: Pick<DispatchTicket, 'storeCode' | 'city'>) {
  const key = storeKeyOf(t.storeCode) ?? '';
  const { city, uf } = splitCity(t.city);
  return [key, [city, uf].filter(Boolean).join('/')].filter(Boolean).join(' - ');
}

export function equipmentLine(t: Pick<DispatchTicket, 'equipment' | 'pdv'>) {
  const pdv = t.pdv?.trim() ? `PDV ${t.pdv.trim().replace(/^pdv\s*/i, '')}` : '';
  return [t.equipment?.trim(), pdv].filter(Boolean).join(' - ') || 'Equipamento não informado';
}

/** O que impede a oferta de sair. A oferta fica retida no painel até resolver. */
export function holdReasons(group: OfferGroup, eligibleCount: number): HoldReason[] {
  const reasons = new Set<HoldReason>();
  for (const t of group.tickets) {
    if (!storeKeyOf(t.storeCode)) reasons.add('sem_loja');
    if (!splitCity(t.city).city) reasons.add('sem_cidade');
    if (!t.allegedDefect?.trim()) reasons.add('sem_defeito');
  }
  if (!reasons.has('sem_cidade') && eligibleCount === 0) reasons.add('sem_tecnico');
  return [...reasons];
}

// ─── Modelos da oferta ─────────────────────────────────
// Cada versão é um par de modelos na Meta (um chamado / vários chamados), com
// os mesmos botões Aceitar e Recusar. Texto de modelo aprovado não muda:
// versão nova = nomes novos. O clique em qualquer versão antiga continua
// valendo, porque o payload é o mesmo.
//   atendimento_disponivel*  "Ver chamado" (sem uso)
//   oferta_atendimento*      "a partir de R$ 70,00" (reserva; a Meta passou para Marketing)
//   oferta_chamado*          "Valor: a combinar" com emoji (Marketing, sem uso)
//   chamado_disponivel*      "a combinar" fixo, tom de aviso (candidata)
//   oferta_valor*            valor como campo: padrão "a combinar com a equipe"
//                            ou o que o funcionário digitar (preferida)
type OfferVersion = {
  single: string; group: string; header: string; groupHeader: string; footer: string;
  /** Tem o valor como parâmetro (o último do corpo). */
  valued?: boolean;
  singleBody: (a: string, b: string, c: string, d: string, e: string) => string;
  groupBody: (a: string, b: string, c: string, d: string) => string;
};

const R70_VALUE = '💰 Ganho: a partir de R$ 70,00. Quanto mais atendimentos, maior o valor.';
/** Valor quando o funcionário não muda (e o da oferta automática). */
export const DEFAULT_OFFER_VALUE = 'a combinar com a equipe';

export const OFFER_VERSIONS = {
  r70: {
    single: 'oferta_atendimento', group: 'oferta_atendimento_grupo',
    header: 'Atendimento disponível', groupHeader: 'Atendimento disponível', footer: 'Responde aí pra gente:',
    singleBody: (a, b, c, d) => `🔧 Chamado: ${a}\n📍 Loja: ${b}\n🖥️ Equipamento: ${c}\n⚠️ Problema: ${d}\n${R70_VALUE}\n\nAgora é com você!`,
    groupBody: (a, b, c) => `🔧 Chamados: ${a} na mesma loja\n📍 Loja: ${b}\n🖥️ Equipamentos: ${c}\n${R70_VALUE}\n\nAceitando, você fica com todos eles. Agora é com você!`,
  },
  aviso: {
    single: 'chamado_disponivel', group: 'chamados_disponiveis',
    header: 'Novo chamado na sua região', groupHeader: 'Novos chamados na sua região', footer: 'Caju Tech',
    singleBody: (a, b, c, d) => `Chamado: ${a}\nLoja: ${b}\nEquipamento: ${c}\nProblema: ${d}\nValor: a combinar com a equipe\n\nPara ficar com este atendimento, toque em Aceitar. Se não puder, toque em Recusar.`,
    groupBody: (a, b, c) => `Chamados: ${a} na mesma loja\nLoja: ${b}\nEquipamentos: ${c}\nValor: a combinar com a equipe\n\nPara ficar com todos estes atendimentos, toque em Aceitar. Se não puder, toque em Recusar.`,
  },
  valor: {
    single: 'oferta_valor', group: 'oferta_valor_grupo', valued: true,
    header: 'Novo chamado na sua região', groupHeader: 'Novos chamados na sua região', footer: 'Caju Tech',
    singleBody: (a, b, c, d, e) => `Chamado: ${a}\nLoja: ${b}\nEquipamento: ${c}\nProblema: ${d}\nValor: ${e}\n\nPara ficar com este atendimento, toque em Aceitar. Se não puder, toque em Recusar.`,
    groupBody: (a, b, c, d) => `Chamados: ${a}\nLojas: ${b}\nEquipamentos: ${c}\nValor: ${d}\n\nPara ficar com todos estes atendimentos, toque em Aceitar. Se não puder, toque em Recusar.`,
  },
} satisfies Record<string, OfferVersion>;

export type OfferVersionKey = keyof typeof OFFER_VERSIONS;
/**
 * Ordem de preferência. Primeiro, a que tiver os dois modelos aprovados como
 * Utilidade (em Marketing a entrega é limitada por pessoa e custa mais). Se
 * nenhuma passar como Utilidade (a Meta tem classificado oferta de trabalho
 * como Marketing, 2026-09-29), a primeira aprovada em qualquer categoria: a
 * com valor, que deixa o funcionário mudar o valor. Sem nenhuma, a reserva
 * "r70". Quem escolhe é offerVersionInUse, no servidor.
 */
export const PREFERRED_OFFER_VERSIONS: OfferVersionKey[] = ['valor', 'aviso'];
export const ACTIVE_OFFER_VERSION: OfferVersionKey = 'r70';

/** Versão a usar, dado o status dos modelos na Meta (nome → status e categoria). */
export function pickOfferVersion(templates: { name: string; status: string; category?: string }[]): OfferVersionKey {
  const approved = (name: string, utility: boolean) => templates.some((t) => t.name === name && t.status === 'APPROVED' && (!utility || t.category === 'UTILITY'));
  const both = (k: OfferVersionKey, utility: boolean) => approved(OFFER_VERSIONS[k].single, utility) && approved(OFFER_VERSIONS[k].group, utility);
  return PREFERRED_OFFER_VERSIONS.find((k) => both(k, true)) ?? PREFERRED_OFFER_VERSIONS.find((k) => both(k, false)) ?? ACTIVE_OFFER_VERSION;
}
export const versionHasValue = (version: OfferVersionKey) => !!(OFFER_VERSIONS[version] as OfferVersion).valued;

/** Valor digitado pelo funcionário, limpo para o modelo (vazio = padrão). */
export function offerValue(value: string | null | undefined): string {
  const v = templateParam(value ?? '', 60);
  return v || DEFAULT_OFFER_VALUE;
}

const ACTIVE = OFFER_VERSIONS[ACTIVE_OFFER_VERSION];
export const ACCEPT_PAYLOAD_PREFIX = 'aceitar:';
export const DECLINE_PAYLOAD_PREFIX = 'recusar:';

export type TemplateMessage = { name: string; body: string[]; payload: string; declinePayload: string };

/** Lojas de uma oferta com vários chamados: uma só vira a linha de sempre; várias, os códigos e a cidade. */
function storesLine(tickets: DispatchTicket[]) {
  const stores = [...new Set(tickets.map((t) => storeKeyOf(t.storeCode) ?? 'sem código'))];
  return stores.length === 1 ? storeLine(tickets[0]) : `${stores.join(', ')} - ${tickets[0].city ?? ''}`.trim();
}

/**
 * Parâmetros do template para uma oferta. Um FSA: os dados dele. Vários FSAs
 * (da mesma loja, ou anexados pelo funcionário na mesma cidade): quantidade,
 * lojas e equipamentos, aceitos juntos. `value` só entra na versão com valor.
 */
export function offerMessage(offerId: number, tickets: DispatchTicket[], version: OfferVersionKey = ACTIVE_OFFER_VERSION, value?: string | null): TemplateMessage {
  const v: OfferVersion = OFFER_VERSIONS[version];
  const payload = `${ACCEPT_PAYLOAD_PREFIX}${offerId}`;
  const declinePayload = `${DECLINE_PAYLOAD_PREFIX}${offerId}`;
  const valueParam = v.valued ? [offerValue(value)] : [];
  if (tickets.length === 1) {
    const t = tickets[0];
    return {
      name: v.single,
      body: [...[t.key, storeLine(t), equipmentLine(t), t.allegedDefect ?? ''].map((p) => templateParam(p)), ...valueParam],
      payload, declinePayload,
    };
  }
  const equipments = [...new Set(tickets.map((t) => t.equipment?.trim()).filter(Boolean))].join(', ') || 'Equipamento não informado';
  const count = v.valued ? templateParam(`${tickets.length} (${tickets.map((t) => t.key).join(', ')})`, 120) : String(tickets.length);
  return {
    name: v.group,
    body: [count, templateParam(storesLine(tickets), 120), templateParam(equipments, 120), ...valueParam],
    payload, declinePayload,
  };
}

/** Texto como o técnico vai ler, para o painel. */
export function previewText(message: TemplateMessage): string {
  const [a, b, c, d, e] = message.body;
  const v: OfferVersion = Object.values(OFFER_VERSIONS).find((x) => x.single === message.name || x.group === message.name) ?? ACTIVE;
  const single = message.name === v.single;
  return `${single ? v.header : v.groupHeader}\n\n${single ? v.singleBody(a, b, c, d, e) : v.groupBody(a, b, c, d)}\n\n${v.footer}\n[Aceitar] [Recusar]`;
}

/** Mesma cidade (sem acento, maiúscula ou UF diferente escrita de outro jeito). */
export function sameCity(a: string | null | undefined, b: string | null | undefined) {
  const x = splitCity(a ?? ''); const y = splitCity(b ?? '');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!x.city || !y.city || norm(x.city) !== norm(y.city)) return false;
  return !x.uf || !y.uf || x.uf.toUpperCase() === y.uf.toUpperCase();
}

/** Id da oferta num clique de botão ("aceitar:42"), ou null se não for aceite. */
export function acceptPayloadOffer(payload: string | null | undefined): number | null {
  const m = (payload ?? '').trim().match(/^aceitar:(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** Id da oferta num clique em "Recusar" ("recusar:42"), ou null. */
export function declinePayloadOffer(payload: string | null | undefined): number | null {
  const m = (payload ?? '').trim().match(/^recusar:(\d+)$/);
  return m ? Number(m[1]) : null;
}

/**
 * A disputa. Só a primeira requisição encontra a oferta aberta: as seguintes
 * mudam 0 linhas e recebem "já aceito". Só quem recebeu a oferta pode aceitar.
 * Parâmetros: ?1 técnico, ?2 agora (ISO), ?3 oferta.
 */
export const ACCEPT_OFFER_SQL = `UPDATE dispatch_offers
SET status = 'assigned', assigned_technician_id = ?1, assigned_at = ?2, updated_at = ?2
WHERE id = ?3 AND status = 'open' AND expires_at > ?2
  AND EXISTS (SELECT 1 FROM dispatch_recipients r WHERE r.offer_id = ?3 AND r.technician_id = ?1)`;

export const ACCEPT_REPLY_WON = 'Atendimento confirmado! ✅ Nossa equipe vai entrar em contato com você para combinar o atendimento.';
export const ACCEPT_REPLY_TAKEN = 'Este atendimento já foi aceito por outro técnico e não está mais disponível.';
export const ACCEPT_REPLY_EXPIRED = 'Esta oferta expirou e não está mais disponível.';
export const DECLINE_REPLY = 'Tudo bem, obrigado por avisar! Você continua recebendo as próximas ofertas.';
export const DECLINE_REPLY_ALREADY_WON = 'Você já aceitou este atendimento. Se não puder mais ir, fale com a coordenação da Caju Tech.';

// ─── Templates (enviados à Meta por /api/dispatch/templates) ─────────
const OFFER_BUTTONS = { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Aceitar' }, { type: 'QUICK_REPLY', text: 'Recusar' }] } as const;

const offerTemplates = (v: OfferVersion) => [
  {
    name: v.single, language: 'pt_BR', category: 'UTILITY',
    components: [
      { type: 'HEADER', format: 'TEXT', text: v.header },
      { type: 'BODY', text: v.singleBody('{{1}}', '{{2}}', '{{3}}', '{{4}}', '{{5}}'), example: { body_text: [['FSA-132506', 'L330 - Patos de Minas/MG', 'CPU - PDV 308', 'PC não liga', ...(v.valued ? ['R$ 90,00'] : [])]] } },
      { type: 'FOOTER', text: v.footer },
      OFFER_BUTTONS,
    ],
  },
  {
    name: v.group, language: 'pt_BR', category: 'UTILITY',
    components: [
      { type: 'HEADER', format: 'TEXT', text: v.groupHeader },
      { type: 'BODY', text: v.groupBody('{{1}}', '{{2}}', '{{3}}', '{{4}}'), example: { body_text: [v.valued ? ['3 (FSA-1, FSA-2, FSA-3)', 'L497, L500 - Candeias/BA', 'CPU, teclado e monitor', 'a combinar com a equipe'] : ['3', 'L497 - Candeias/BA', 'CPU, teclado e monitor']] } },
      { type: 'FOOTER', text: v.footer },
      OFFER_BUTTONS,
    ],
  },
];

/** A versão em uso e a candidata: o painel mostra o status das duas e envia a que faltar. */
export const DISPATCH_TEMPLATES = [...offerTemplates(OFFER_VERSIONS.r70), ...offerTemplates(OFFER_VERSIONS.aviso), ...offerTemplates(OFFER_VERSIONS.valor)];

/** Corpo do POST /{phone-number-id}/messages para uma oferta. */
export function templateSendPayload(to: string, message: TemplateMessage) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: message.name,
      language: { code: 'pt_BR' },
      components: [
        { type: 'body', parameters: message.body.map((text) => ({ type: 'text', text })) },
        { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: message.payload }] },
        { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: message.declinePayload }] },
      ],
    },
  };
}

// ─── Lista de teste (DISPATCH_MODE=allowlist) ─────────
/** DISPATCH_ALLOWLIST: telefones separados por vírgula. Só eles recebem ofertas no modo de teste. */
export function parseAllowlist(value: string | null | undefined): string[] {
  // Espaço não separa: "81 99173-8635" é um número só.
  return (value ?? '').split(/[,;\n]+/).map((p) => whatsappPhone(p)).filter((p): p is string => Boolean(p));
}

export function allowedToReceive(mode: DispatchMode, allowlist: string[], phone: string | null | undefined) {
  if (mode === 'live') return true;
  if (mode === 'allowlist') return allowlist.some((p) => samePhone(p, phone));
  return false;
}

// ─── Depois do aceite ──────────────────────────────────
/** Campo "Dados dos Técnicos" do Jira, no mesmo formato do agendamento (o telefone não vai ao Jira). */
export function technicianDataBlock(name: string, cpf: string | null | undefined) {
  return `Nome: ${name}\nCPF: ${cpf?.trim() || 'Não informado'}\nRG: \nTEL: .`;
}

/** Texto do aviso interno (push e chat do Caju OS). */
export function acceptedNotice(tickets: string[], storeKey: string, technician: string) {
  return {
    title: `Atendimento aceito · ${tickets.join(', ')}`,
    body: `${technician} aceitou pelo WhatsApp · ${storeKey}`,
    chat: `✅ ${tickets.join(', ')} (${storeKey}) aceito por ${technician} pelo WhatsApp.`,
  };
}

// ─── Oferta de teste ───────────────────────────────────
/**
 * Modo gravado na oferta de teste (botão no painel). Loja e chamado são
 * fictícios: o aceite roda a disputa e os avisos, mas não vincula chamado nem
 * mexe no Jira.
 */
export const TEST_MODE = 'test';
export const isTestOffer = (mode: string | null | undefined) => mode === TEST_MODE;

export function testOfferTicket(offerId: number, city: string): DispatchTicket {
  return {
    key: `TESTE-${offerId}`, storeCode: 'L999', storeName: 'Loja de teste', city,
    equipment: 'CPU', pdv: '1', allegedDefect: 'Teste da distribuição, não é um chamado real',
  };
}

/** Aviso de teste: igual ao de verdade, marcado para ninguém agir nele. */
export function testNotice(notice: { title: string; body: string; chat: string }) {
  return { title: `Teste · ${notice.title}`, body: notice.body, chat: `[Teste] ${notice.chat}` };
}

/** Sem técnico na cidade: a oferta fica retida e só a equipe é avisada (nada vai a cidade vizinha). */
export function noTechnicianNotice(tickets: string[], storeKey: string, city: string) {
  return {
    title: `Sem técnico em ${city} · ${tickets.join(', ')}`,
    body: `Nenhum técnico cadastrado em ${city} para ${storeKey}. A oferta ficou retida: agende manualmente ou cadastre um técnico na cidade.`,
    chat: `⚠️ ${tickets.join(', ')} (${storeKey}) é de ${city} e não há técnico cadastrado lá. Nada foi enviado aos técnicos. Agende manualmente ou cadastre um técnico na cidade.`,
  };
}

export function unansweredNotice(tickets: string[], storeKey: string) {
  return {
    title: `Ninguém aceitou · ${tickets.join(', ')}`,
    body: `A oferta de ${storeKey} expirou em ${OFFER_HOURS} h sem resposta. Ofereça de novo ou agende manualmente.`,
    chat: `⚠️ Ninguém aceitou ${tickets.join(', ')} (${storeKey}) em ${OFFER_HOURS} h. Ofereça de novo ou agende manualmente.`,
  };
}

/** Templates dos avisos no WhatsApp dos gestores (usados na etapa seguinte; aprovados antes). */
export const NOTICE_TEMPLATES = [
  {
    name: 'atendimento_aceito',
    language: 'pt_BR',
    category: 'UTILITY',
    components: [{
      type: 'BODY',
      text: 'O chamado {{1}} da loja {{2}} foi aceito por {{3}} pelo WhatsApp. Os detalhes estão no Caju OS.',
      example: { body_text: [['FSA-132506', 'L330 - Patos de Minas/MG', 'Fulano de Tal']] },
    }],
  },
  {
    name: 'atendimento_sem_resposta',
    language: 'pt_BR',
    category: 'UTILITY',
    components: [{
      type: 'BODY',
      text: 'Ninguém aceitou o chamado {{1}} da loja {{2}} em 2 horas. Ofereça de novo ou agende manualmente pelo Caju OS.',
      example: { body_text: [['FSA-132506', 'L330 - Patos de Minas/MG']] },
    }],
  },
  {
    name: 'distribuicao_resumo',
    language: 'pt_BR',
    category: 'UTILITY',
    components: [{
      type: 'BODY',
      text: 'Resumo da distribuição enquanto os seus avisos estavam pausados. Aceitos: {{1}}. Sem resposta: {{2}}. Os detalhes estão no Caju OS.',
      example: { body_text: [['FSA-132506 (Fulano), FSA-132507 (Beltrano)', 'nenhum']] },
    }],
  },
] as const;
