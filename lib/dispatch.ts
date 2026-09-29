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
 * Todos os técnicos cadastrados na cidade (requisito 2), com cadastro aprovado
 * e telefone válido para WhatsApp. Cidade base ou listada em "outras cidades".
 * O `status` (online/ocupado) não entra: ninguém o mantém atualizado.
 */
export function eligibleTechnicians(techs: DispatchTechnician[], city: string, uf: string | null): DispatchTechnician[] {
  const target = fold(city);
  if (!target) return [];
  return techs.filter((t) => {
    if (!t.approved || !whatsappPhone(t.phone)) return false;
    const sameBase = fold(t.baseCity) === target && (!uf || !t.baseState || t.baseState.trim().toUpperCase() === uf);
    const extras = (t.extraCities ?? '').split(/[;,\n|]+/).map((c) => fold(splitCity(c).city)).filter(Boolean);
    return sameBase || extras.includes(target);
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

/**
 * Valor para o técnico: combinado depois do aceite (decisão da gerência em
 * 2026-09-29; antes era "a partir de R$ 70,00"). Texto fixo do template:
 * mudar exige nova aprovação da Meta.
 */
export const VALUE_LINE = '💰 Valor: a combinar';

// Nome novo a cada mudança de texto ou botões (a aprovação da Meta é por
// modelo). Sem uso, mas o clique neles continua valendo pelo mesmo payload:
// atendimento_disponivel* ("Ver chamado") e oferta_atendimento* ("R$ 70,00").
export const TEMPLATE_SINGLE = 'oferta_chamado';
export const TEMPLATE_GROUP = 'oferta_chamado_grupo';
export const ACCEPT_PAYLOAD_PREFIX = 'aceitar:';
export const DECLINE_PAYLOAD_PREFIX = 'recusar:';

export type TemplateMessage = { name: string; body: string[]; payload: string; declinePayload: string };

/**
 * Parâmetros do template para uma oferta. Um FSA: os dados dele. Vários FSAs
 * da mesma loja: quantidade, loja e equipamentos, aceitos juntos.
 */
export function offerMessage(offerId: number, tickets: DispatchTicket[]): TemplateMessage {
  const payload = `${ACCEPT_PAYLOAD_PREFIX}${offerId}`;
  const declinePayload = `${DECLINE_PAYLOAD_PREFIX}${offerId}`;
  if (tickets.length === 1) {
    const t = tickets[0];
    return {
      name: TEMPLATE_SINGLE,
      body: [t.key, storeLine(t), equipmentLine(t), t.allegedDefect ?? ''].map((v) => templateParam(v)),
      payload, declinePayload,
    };
  }
  const equipments = [...new Set(tickets.map((t) => t.equipment?.trim()).filter(Boolean))].join(', ') || 'Equipamento não informado';
  return {
    name: TEMPLATE_GROUP,
    body: [String(tickets.length), storeLine(tickets[0]), templateParam(equipments, 120)],
    payload, declinePayload,
  };
}

const SINGLE_BODY = (a: string, b: string, c: string, d: string) =>
  `🔧 Chamado: ${a}\n📍 Loja: ${b}\n🖥️ Equipamento: ${c}\n⚠️ Problema: ${d}\n${VALUE_LINE}\n\nAgora é com você!`;
const GROUP_BODY = (a: string, b: string, c: string) =>
  `🔧 Chamados: ${a} na mesma loja\n📍 Loja: ${b}\n🖥️ Equipamentos: ${c}\n${VALUE_LINE}\n\nAceitando, você fica com todos eles. Agora é com você!`;
const OFFER_HEADER = 'Atendimento disponível';
const OFFER_FOOTER = 'Responde aí pra gente:';

/** Texto como o técnico vai ler, para o painel. */
export function previewText(message: TemplateMessage): string {
  const [a, b, c, d] = message.body;
  const body = message.name === TEMPLATE_SINGLE ? SINGLE_BODY(a, b, c, d) : GROUP_BODY(a, b, c);
  return `${OFFER_HEADER}\n\n${body}\n\n${OFFER_FOOTER}\n[Aceitar] [Recusar]`;
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

export const DISPATCH_TEMPLATES = [
  {
    name: TEMPLATE_SINGLE,
    language: 'pt_BR',
    category: 'UTILITY',
    components: [
      { type: 'HEADER', format: 'TEXT', text: OFFER_HEADER },
      {
        type: 'BODY',
        text: SINGLE_BODY('{{1}}', '{{2}}', '{{3}}', '{{4}}'),
        example: { body_text: [['FSA-132506', 'L330 - Patos de Minas/MG', 'CPU - PDV 308', 'PC não liga']] },
      },
      { type: 'FOOTER', text: OFFER_FOOTER },
      OFFER_BUTTONS,
    ],
  },
  {
    name: TEMPLATE_GROUP,
    language: 'pt_BR',
    category: 'UTILITY',
    components: [
      { type: 'HEADER', format: 'TEXT', text: OFFER_HEADER },
      {
        type: 'BODY',
        text: GROUP_BODY('{{1}}', '{{2}}', '{{3}}'),
        example: { body_text: [['3', 'L497 - Candeias/BA', 'CPU, teclado e monitor']] },
      },
      { type: 'FOOTER', text: OFFER_FOOTER },
      OFFER_BUTTONS,
    ],
  },
] as const;

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
