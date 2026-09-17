import type { AssistantIssue } from '@/lib/assistant';
import type { getJiraIssue } from '@/lib/server/jira';

// Chamado do Jira no formato que o assistente lê. Único lugar dessa conversão:
// a leitura (/api/assistant) e a escrita assistida (/api/assistant/actions)
// precisam ver o mesmo chamado.
export function toAssistantIssue(issue: Awaited<ReturnType<typeof getJiraIssue>>): AssistantIssue {
  return {
    key: issue.key,
    summary: issue.summary,
    status: issue.status,
    priority: issue.priority,
    store: issue.operationalFields.storeName ?? issue.store,
    city: issue.city,
    createdAt: issue.createdAt,
    scheduledAt: issue.operationalFields.scheduledDateTime ?? issue.scheduledAt,
    partnerTriggeredAt: issue.partnerTriggeredAt,
    technicianName: issue.technicianName,
    description: issue.description,
    allegedDefect: issue.operationalFields.allegedDefect,
    problemCategory: issue.operationalFields.problemCategory,
    equipmentModel: issue.operationalFields.equipmentModel,
    defectSummary: issue.operationalFields.defectSummary,
    technicianData: issue.operationalFields.technicianData,
    internalComments: (issue.internalComments ?? []).map((comment) => ({ author: comment.author, createdAt: comment.createdAt, body: comment.body })),
  };
}
