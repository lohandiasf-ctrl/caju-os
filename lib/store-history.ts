// Histórico de uma loja a partir dos chamados arquivados: o que foi feito, quando,
// por quê, quem atendeu e quanto foi lançado. Puro para os testes.

export type StoreVisit = {
  ticketKey: string; title: string; status: string; city: string | null; when: string | null;
  defect: string | null; summary: string | null; technician: string | null; total: number | null; visitCost1: number | null; equipmentTotal: number | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const text = String(v).trim().replace(/[^\d,.-]/g, '');
  const n = Number(text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** "L158", "Loja 158" e "158" são a mesma loja. */
export const storeCodeKey = (value: string | null | undefined): string | null => {
  // O número no fim do texto: "L158", "Loja 158", "Código da loja L158" e "158" são a mesma loja.
  const m = String(value ?? '').trim().match(/(?:^|\s|[A-Za-z])0*(\d{1,6})$/);
  return m ? m[1] : null;
};

type Archive = { ticketKey: string; title: string; jiraStatus: string | null; operationalStatus: string | null; storeName: string | null; city: string | null; capturedAt: string; snapshot: string };

export function visitOf(a: Archive): StoreVisit {
  let jira: Record<string, unknown> = {};
  try { jira = (JSON.parse(a.snapshot) as { jira?: Record<string, unknown> }).jira ?? {}; } catch { /* snapshot ilegível: só o resumo */ }
  const f = (jira.operationalFields ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const tech = text(f.technicianData)?.match(/(?:Nome completo|Nome):\s*([^\r\n]+)/i)?.[1]?.trim() ?? text(jira.technicianName) ?? text(f.technicianData);
  return {
    ticketKey: a.ticketKey, title: a.title, status: a.operationalStatus ?? a.jiraStatus ?? '', city: a.city,
    when: text(f.serviceStartedAt) ?? text(f.scheduledDateTime) ?? text(jira.scheduledAt) ?? a.capturedAt,
    defect: text(f.allegedDefect), summary: text(f.defectSummary), technician: tech,
    total: num(f.ticketTotal), visitCost1: num(f.visitCost1), equipmentTotal: num(f.equipmentTotal),
  };
}

export function storeVisits(archives: readonly Archive[], code: string): StoreVisit[] {
  const wanted = storeCodeKey(code);
  if (!wanted) return [];
  return archives
    .filter((a) => storeCodeKey(a.storeName) === wanted || new RegExp(`(?:^|\\W)(?:loja\\s+|l)0*${wanted}(?!\\d)`, 'i').test(a.title))
    .map(visitOf)
    .sort((x, y) => (y.when ?? '').localeCompare(x.when ?? ''));
}
