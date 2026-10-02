// Solicitações da gerência (clientes fora do Jira): estado derivado dos campos,
// nome do grupo no WhatsApp e texto da devolução. Puro para os testes.

export type Solicitation = {
  id: number; requesterEmail: string; requesterPhone: string; client: string; city: string; uf: string | null; store: string | null; address: string | null;
  description: string; priority: 'normal' | 'alta'; assigneeEmail: string | null; technicianId: number | null; technicianName?: string | null;
  scheduledAt: string | null; groupJid: string | null; groupName: string | null; returnedAt: string | null; cancelledAt: string | null; createdAt: string; updatedAt: string;
};

export type SolicitationStatus = 'nova' | 'em_andamento' | 'pronta' | 'devolvida' | 'cancelada';

export const STATUS_LABEL: Record<SolicitationStatus, string> = {
  nova: 'Nova', em_andamento: 'Em andamento', pronta: 'Pronta para devolver', devolvida: 'Devolvida', cancelada: 'Cancelada',
};

/** Passos que faltam antes de devolver ao solicitante. */
export function missingSteps(s: Pick<Solicitation, 'technicianId' | 'scheduledAt' | 'groupJid'> & { groupName?: string | null }): string[] {
  // O grupo conta como feito se foi criado pelo sistema (jid) ou registrado à mão (nome/link).
  return [!s.technicianId && 'técnico', !s.scheduledAt && 'dia e hora', !(s.groupJid || s.groupName) && 'grupo no WhatsApp'].filter((x): x is string => Boolean(x));
}

export function statusOf(s: Pick<Solicitation, 'assigneeEmail' | 'technicianId' | 'scheduledAt' | 'groupJid' | 'returnedAt' | 'cancelledAt'> & { groupName?: string | null }): SolicitationStatus {
  if (s.cancelledAt) return 'cancelada';
  if (s.returnedAt) return 'devolvida';
  if (!s.assigneeEmail) return 'nova';
  return missingSteps(s).length ? 'em_andamento' : 'pronta';
}

/** "2026-10-03T14:00" ou ISO com fuso → "03/10 às 14:00" (horário de Brasília). */
export function whenText(value: string | null | undefined): string {
  if (!value) return '';
  const local = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (local) return `${local[3]}/${local[2]} às ${local[4]}:${local[5]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')} às ${get('hour')}:${get('minute')}`;
}

/** "03/10 às 14:00 - IPOJUCA/PE - CLIENTE LOJA 12" (o padrão dos grupos da operação). */
export function groupNameOf(s: Pick<Solicitation, 'scheduledAt' | 'city' | 'uf' | 'client' | 'store'>, max = 100): string {
  const place = [s.city.toUpperCase(), s.uf?.toUpperCase()].filter(Boolean).join('/');
  const target = [s.client.toUpperCase(), s.store?.trim()].filter(Boolean).join(' ');
  const name = [whenText(s.scheduledAt), place, target].filter(Boolean).join(' - ');
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

/** Mensagem que o solicitante recebe no WhatsApp ao devolver. */
export function returnMessage(s: Pick<Solicitation, 'client' | 'store' | 'city' | 'uf' | 'scheduledAt' | 'groupName'> & { technicianName?: string | null }): string {
  const place = [s.city, s.uf].filter(Boolean).join('/');
  return [
    '✅ Solicitação atendida',
    `${[s.client, s.store].filter(Boolean).join(' · ')} — ${place}`,
    s.technicianName ? `Técnico: ${s.technicianName}` : null,
    s.scheduledAt ? `Dia: ${whenText(s.scheduledAt)}` : null,
    s.groupName ? `Grupo: ${s.groupName}` : null,
  ].filter(Boolean).join('\n');
}

export type NewSolicitation = { requesterPhone: string; client: string; city: string; uf: string | null; store: string | null; address: string | null; description: string; priority: 'normal' | 'alta' };

/** Valida o formulário; devolve o erro em português ou os dados limpos. */
export function parseNewSolicitation(body: Record<string, unknown> | null): { error: string } | { value: NewSolicitation } {
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const client = text(body?.client, 120);
  const city = text(body?.city, 120);
  const description = text(body?.description, 2000);
  const phoneDigits = text(body?.requesterPhone, 40).replace(/\D/g, '').replace(/^0+/, '');
  if (!client) return { error: 'Informe o cliente.' };
  if (!city) return { error: 'Informe a cidade.' };
  if (description.length < 5) return { error: 'Descreva o que foi pedido.' };
  if (phoneDigits.length < 10 || phoneDigits.length > 13) return { error: 'Informe o WhatsApp de quem pediu, com DDD.' };
  const uf = text(body?.uf, 2).toUpperCase();
  return {
    value: {
      requesterPhone: phoneDigits.startsWith('55') && phoneDigits.length >= 12 ? phoneDigits : `55${phoneDigits}`,
      client, city, uf: /^[A-Z]{2}$/.test(uf) ? uf : null, store: text(body?.store, 80) || null, address: text(body?.address, 240) || null,
      description, priority: body?.priority === 'alta' ? 'alta' : 'normal',
    },
  };
}
