export type DelegatedTask = {
  id: number;
  ticketKey?: string | null;
  title: string;
  assignedTo?: string | null;
  acceptedBy?: string | null;
  status: 'open' | 'accepted' | 'in_progress' | 'done' | 'cancelled';
  progressNote?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  nextCheckAt: string;
  dueAt?: string | null;
  createdBy: string;
};

export type TaskCheckNotification = {
  taskId: number;
  type: '30m_checkin' | 'manager_escalation';
  recipientRoleOrEmail: string;
  message: string;
};

export function evaluateTaskProgress(task: DelegatedTask, currentIsoTime: string): TaskCheckNotification | null {
  const now = new Date(currentIsoTime).getTime();
  const nextCheck = new Date(task.nextCheckAt).getTime();
  const due = task.dueAt ? new Date(task.dueAt).getTime() : null;

  if (due && now > due && task.status !== 'done' && task.status !== 'cancelled') {
    return {
      taskId: task.id,
      type: 'manager_escalation',
      recipientRoleOrEmail: 'gerencia',
      message: `🚨 TAREFA ATRASADA ESCALONADA: A tarefa "${task.title}" (Chamado: ${task.ticketKey || 'N/A'}) venceu e não foi concluída por ${task.acceptedBy || 'Ninguém'}.`,
    };
  }

  if (task.status === 'accepted' || task.status === 'in_progress') {
    if (now >= nextCheck) {
      return {
        taskId: task.id,
        type: '30m_checkin',
        recipientRoleOrEmail: task.acceptedBy || task.createdBy,
        message: `⏱️ ACOMPANHAMENTO (30 min): Como está o andamento da tarefa "${task.title}"? Atualize a nota de progresso.`,
      };
    }
  }

  return null;
}
