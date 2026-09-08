export type FieldDiff = {
  field: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
};

export type AuditLogPayload = {
  ticketKey: string;
  actorEmail: string;
  origin: 'sistema' | 'Jira';
  reason?: string;
  diffs: FieldDiff[];
  createdAt: string;
};

export function formatAuditEntry(payload: AuditLogPayload): string {
  const changes = payload.diffs
    .map(d => `• ${d.fieldLabel}: de "${d.oldValue ?? 'vazio'}" para "${d.newValue ?? 'vazio'}"`)
    .join('\n');

  return `[${payload.createdAt}] Alteração realizada por ${payload.actorEmail} via ${payload.origin.toUpperCase()}\n` +
         `Motivo: ${payload.reason || 'Sem motivo especificado'}\n` +
         `Modificações:\n${changes}`;
}
