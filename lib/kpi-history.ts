// Série diária da fila de chamados e a escolha do período de comparação da Visão
// geral. Puro (sem rede nem banco) para os testes.

export type KpiRow = {
  day: string; open: number; pendingSchedule: number; scheduled: number; directed: number;
  awaitingSpare: number; inField: number; withTechnician: number;
};

export type CompareChoice = 'yesterday' | 'week' | 'month' | 'year' | 'date';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Etapa do Jira → etapa do sistema (a mesma regra do toTicket da tela). */
export function stageOf(rawStatus: string): 'pendingSchedule' | 'scheduled' | 'awaitingSpare' | 'directed' | 'inField' {
  const text = fold(rawStatus);
  if (text === 'agendado') return 'scheduled';
  if (text.includes('agendamento')) return 'pendingSchedule';
  if (text.includes('spare')) return 'awaitingSpare';
  if (text === 'direcionado') return 'directed';
  return 'inField';
}

/** Contagens da fila no dia `day` ("2026-10-02") a partir dos chamados ativos do Jira. */
export function kpiRowOf(day: string, issues: ReadonlyArray<{ status: string; technicianName?: string | null }>): KpiRow {
  const row: KpiRow = { day, open: issues.length, pendingSchedule: 0, scheduled: 0, directed: 0, awaitingSpare: 0, inField: 0, withTechnician: 0 };
  for (const issue of issues) {
    row[stageOf(issue.status)] += 1;
    if (issue.technicianName?.trim()) row.withTechnician += 1;
  }
  return row;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** O dia a comparar: ontem, mesmo dia da semana passada, mesmo dia do mês passado/ano passado, ou a data escolhida. */
export function compareTarget(choice: CompareChoice, today: Date, picked?: Date | null): string | null {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (choice) {
    case 'yesterday': return dayString(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1));
    case 'week': return dayString(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 7));
    case 'month': {
      // Dia 31 num mês de 30 dias cai no último dia do mês anterior, não no mês seguinte.
      const last = new Date(t.getFullYear(), t.getMonth(), 0).getDate();
      return dayString(new Date(t.getFullYear(), t.getMonth() - 1, Math.min(t.getDate(), last)));
    }
    case 'year': {
      const last = new Date(t.getFullYear() - 1, t.getMonth() + 1, 0).getDate();
      return dayString(new Date(t.getFullYear() - 1, t.getMonth(), Math.min(t.getDate(), last)));
    }
    case 'date': return picked ? dayString(picked) : null;
  }
}

/** Retrato do dia pedido; sem ele, o mais próximo até 3 dias antes (a rotina pode ter falhado num dia). */
export function pickRow(rows: readonly KpiRow[], target: string | null): KpiRow | null {
  if (!target) return null;
  const exact = rows.find((r) => r.day === target);
  if (exact) return exact;
  const [y, m, d] = target.split('-').map(Number);
  for (let back = 1; back <= 3; back += 1) {
    const key = dayString(new Date(y, m - 1, d - back));
    const hit = rows.find((r) => r.day === key);
    if (hit) return hit;
  }
  return null;
}
