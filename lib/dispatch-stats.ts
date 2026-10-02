// Histórico de respostas por técnico: quantas ofertas recebeu, leu, aceitou,
// recusou ou ignorou. Serve para decidir quem sai da lista (nunca aceita nada) e
// controlar o custo das mensagens. Puro para os testes.

export type RecipientRow = { technicianId: number; name: string; city: string | null; status: string; updatedAt: string; offerStatus: string; assignedTechnicianId: number | null };

export type TechnicianStats = {
  technicianId: number; name: string; city: string | null;
  received: number; read: number; accepted: number; declined: number; ignored: number; lastResponseAt: string | null;
  acceptRate: number | null; neverAccepted: boolean;
};

/** Mensagens que de fato saíram (simulação, teste de lista e pendentes não contam). */
const SENT = new Set(['sent', 'delivered', 'read', 'clicked', 'declined']);
const READ = new Set(['read', 'clicked', 'declined']);

export function technicianStats(rows: readonly RecipientRow[], minForFlag = 5): TechnicianStats[] {
  const byTech = new Map<number, TechnicianStats>();
  for (const row of rows) {
    if (!SENT.has(row.status)) continue;
    const s = byTech.get(row.technicianId) ?? { technicianId: row.technicianId, name: row.name, city: row.city, received: 0, read: 0, accepted: 0, declined: 0, ignored: 0, lastResponseAt: null, acceptRate: null, neverAccepted: false };
    s.received += 1;
    if (READ.has(row.status)) s.read += 1;
    const won = row.assignedTechnicianId === row.technicianId;
    if (won) s.accepted += 1;
    else if (row.status === 'declined') s.declined += 1;
    else if (row.status === 'clicked') s.accepted += 1; // clicou em aceitar, mas outro chegou antes: responde, não ignorou
    else s.ignored += 1;
    if ((won || row.status === 'declined' || row.status === 'clicked') && (!s.lastResponseAt || row.updatedAt > s.lastResponseAt)) s.lastResponseAt = row.updatedAt;
    byTech.set(row.technicianId, s);
  }
  return [...byTech.values()].map((s) => ({
    ...s,
    acceptRate: s.received ? Math.round((s.accepted / s.received) * 100) : null,
    neverAccepted: s.received >= minForFlag && s.accepted === 0,
  })).sort((a, b) => Number(b.neverAccepted) - Number(a.neverAccepted) || b.received - a.received || a.name.localeCompare(b.name, 'pt-BR'));
}
