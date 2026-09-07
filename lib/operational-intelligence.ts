export type DispatchTechnician = {
  id: number;
  name: string;
  city: string;
  state: string;
  status?: string | null;
  approved?: boolean;
  availableTools?: string | null;
  specialties?: string | null;
  extraCities?: string | null;
  hasVehicle?: string | null;
  reviewAvg?: number | null;
  reviewCount?: number | null;
};

export type DispatchTicket = {
  city: string;
  state: string;
  category: string;
  priority: 'alta' | 'normal' | 'baixa';
  marginCents: number;
};

export type KnowledgeArticle = { title: string; steps: string[] };

export type DelegatedTask = {
  status: string;
  nextCheckAt: string;
  dueAt?: string | null;
  acceptedBy?: string | null;
};

const KM_RATE_CENTS = 120;

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    title: 'Como resolver CPU travando',
    steps: [
      'Confirmar se o PDV liga, trava no Windows, trava no aplicativo ou desliga sozinho.',
      'Verificar inicialização, uso de CPU/memória, espaço em disco e temperatura.',
      'Testar reinício controlado, periféricos e comunicação com PDV/self-checkout.',
      'Se persistir, registrar logs/foto e indicar peça, formatação ou reinstalação necessária.',
    ],
  },
  {
    title: 'Testes obrigatórios por categoria',
    steps: [
      'Confirmar equipamento, PDV e sintoma informado pela loja.',
      'Registrar teste feito, resultado e evidência antes de mudar a etapa.',
      'Se houver troca de peça, preencher a peça exata e anexar foto/RAT.',
    ],
  },
  {
    title: 'Quando trocar determinada peça',
    steps: [
      'Trocar só após teste cruzado com cabo, fonte ou porta funcional.',
      'Registrar serial/modelo da peça atual e evidência do defeito.',
      'Preencher peça a ser trocada antes de enviar para validação.',
    ],
  },
  {
    title: 'Procedimento de RAT',
    steps: [
      'Conferir data, loja, técnico, assinatura e descrição do serviço.',
      'Anexar RAT legível como evidência interna do chamado.',
      'Validar se a descrição bate com o resumo técnico enviado ao Jira.',
    ],
  },
  {
    title: 'Como preencher campos do Jira',
    steps: [
      'Problema identificado: causa encontrada, não só o sintoma.',
      'Testes feitos: passos objetivos realizados pelo técnico/N1.',
      'Peça a ser trocada: modelo ou “não se aplica” quando não houver troca.',
    ],
  },
];

export function knowledgeArticles(category: string, title: string) {
  const text = normalize(`${category} ${title}`);
  const featured = /cpu|pdv|trav|lent|deslig|performance/.test(text)
    ? 'Como resolver CPU travando'
    : /impress|scanner|leitor|pinpad|tef|peca|fonte/.test(text)
      ? 'Quando trocar determinada peça'
      : 'Testes obrigatórios por categoria';
  return [...KNOWLEDGE_ARTICLES].sort((a, b) => Number(b.title === featured) - Number(a.title === featured));
}

export function estimatedDistanceKm(tech: DispatchTechnician, ticket: Pick<DispatchTicket, 'city' | 'state'>) {
  const city = normalize(ticket.city);
  const state = normalize(ticket.state);
  const techCity = normalize(tech.city);
  const techState = normalize(tech.state);
  const extraCities = normalize(tech.extraCities ?? '');
  if (techCity && city && techCity === city) return 8;
  if (city && extraCities.includes(city)) return 45;
  if (techState && state && techState === state) return 140;
  if (techState && state) return 380;
  return 220;
}

export function travelCostCents(distanceKm: number) {
  return Math.round(Math.max(0, distanceKm) * KM_RATE_CENTS);
}

export function recommendTechnicians(technicians: DispatchTechnician[], ticket: DispatchTicket) {
  const city = normalize(ticket.city);
  const state = normalize(ticket.state);
  const category = normalize(ticket.category);
  const profitable = ticket.priority === 'alta' || ticket.marginCents > 0;
  return technicians
    .map((tech) => {
      let score = 18;
      const reasons: string[] = [];
      const distanceKm = estimatedDistanceKm(tech, ticket);
      const travelCents = travelCostCents(distanceKm);
      const specialties = normalize(tech.specialties ?? '');
      const tools = normalize(tech.availableTools ?? '');
      const extraCities = normalize(tech.extraCities ?? '');
      const techCity = normalize(tech.city);
      const techState = normalize(tech.state);

      score += Math.max(0, 24 - Math.round(distanceKm / 12));
      reasons.push(`distância ~${Math.round(distanceKm)} km`);

      if (techCity && city && techCity === city) {
        score += 16;
        reasons.push('mesma cidade');
      } else if (city && extraCities.includes(city)) {
        score += 12;
        reasons.push('atende a região');
      } else if (techState && state && techState === state) {
        score += 6;
        reasons.push('mesmo estado');
      }

      if (tech.status === 'online') {
        score += 14;
        reasons.push('disponível agora');
      } else if (tech.status === 'busy') {
        score -= 8;
        reasons.push('ocupado');
      } else if (tech.status === 'offline' || tech.status === 'break') {
        score -= 14;
        reasons.push(tech.status === 'break' ? 'em pausa' : 'offline');
      }

      if (tech.approved) {
        score += 6;
        reasons.push('aprovado');
      }
      if (matchesSpecialty(category, specialties)) {
        score += 14;
        reasons.push('especialidade compatível');
      }
      if (matchesTools(category, tools)) {
        score += 8;
        reasons.push('ferramentas adequadas');
      }

      const reviewAvg = Number(tech.reviewAvg ?? 0);
      const reviewCount = Number(tech.reviewCount ?? 0);
      if (reviewCount > 0) {
        score += Math.round((reviewAvg - 3) * 6);
        reasons.push(`histórico ${reviewAvg.toFixed(1)}/5 (${reviewCount})`);
      }

      const travelPenalty = Math.min(12, Math.round(travelCents / 4000));
      score -= travelPenalty;
      reasons.push(`deslocamento ${formatBRL(travelCents)}`);

      if (profitable && score >= 55) {
        score += 6;
        reasons.push('prioridade por lucro');
      } else if (ticket.priority === 'baixa') {
        score -= 4;
        reasons.push('chamado de baixa prioridade');
      }
      if (normalize(tech.hasVehicle ?? '').includes('sim') && distanceKm > 20) {
        score += 4;
        reasons.push('tem veículo');
      }

      return {
        tech,
        score: Math.max(0, Math.min(100, score)),
        reasons,
        distanceKm,
        travelCents,
      };
    })
    .sort((a, b) => b.score - a.score || a.tech.name.localeCompare(b.tech.name, 'pt-BR'));
}

export function delegatedTaskState(task: DelegatedTask, now = Date.now()) {
  if (task.status === 'done' || task.status === 'cancelled') {
    return { kind: 'done' as const, label: 'Concluída e ligada ao chamado' };
  }
  const followUp = Date.parse(task.nextCheckAt);
  const due = Date.parse(task.dueAt || '') || followUp + 30 * 60_000;
  if (Number.isFinite(due) && now >= due) {
    return { kind: 'manager' as const, label: 'Vencida: notificar gerente' };
  }
  if (Number.isFinite(followUp) && now >= followUp) {
    return { kind: 'followup' as const, label: 'Perguntar andamento (30 min)' };
  }
  if (!task.acceptedBy && task.status === 'open') {
    return { kind: 'open' as const, label: 'Aguardando aceite' };
  }
  return { kind: 'active' as const, label: task.acceptedBy ? `Responsável: ${task.acceptedBy}` : 'Em andamento' };
}

export function matchesSpecialty(category: string, specialties: string) {
  if (!category || !specialties) return false;
  return category
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .some((word) => specialties.includes(word));
}

export function matchesTools(category: string, tools: string) {
  if (!category || !tools) return false;
  if (/rede|cabo|switch/.test(category)) return /alicate|rede|testador|crimp/.test(tools);
  if (/cpu|pdv|desktop|hardware/.test(category)) return /chave|multimetro|format|pendrive|ssd|memoria/.test(tools);
  if (/impress|scanner/.test(category)) return /limpeza|chave|multimetro|usb/.test(tools);
  return false;
}

export function normalize(value: string) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
