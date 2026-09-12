/**
 * Espelha os tipos que a web já usa (app/page.tsx, lib/server/jira.ts). Mesma
 * API, mesmos nomes — quem mexer nos dois lados reconhece o formato.
 */

export type UserRole = 'gerencia' | 'coordenador' | 'n1' | 'analista' | 'tecnico';

export type AuthUser = { uid: string; email: string; role: UserRole };

export type Status =
  | 'Pendente de agendamento'
  | 'Agendado'
  | 'Aguardando spare'
  | 'Direcionado'
  | 'Técnico em campo';

export type JiraTicket = {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  assignee: string | null;
  updatedAt: string;
  store: string | null;
  city: string | null;
  scheduledAt: string | null;
  partnerTriggeredAt: string | null;
};

export type JiraAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  author: string | null;
};

export type JiraDetails = JiraTicket & {
  description: string;
  reporter: string | null;
  issueType: string;
  project: string;
  createdAt: string;
  jiraUrl: string;
  operationalFields: Record<string, unknown>;
  attachments: JiraAttachment[];
  internalComments?: Array<{ id: string; body: string; author: string | null; createdAt: string }>;
};

export type Ticket = {
  id: string;
  title: string;
  store: string;
  city: string;
  status: Status;
  rawStatus: string;
  priority: 'Alta' | 'Media' | 'Baixa';
  technician?: string;
  scheduledAt?: string;
  updatedAt?: string;
};

export type OperationalDashboard = {
  alerts: Array<{ ticketKey: string; level: 'critical' | 'warning'; message: string }>;
  metrics: {
    active: number;
    overdue: number;
    scheduled: number;
    visits: number;
    revenueCents: number;
    costCents: number;
    marginCents: number;
  };
  n1: Array<{ email: string; count: number }>;
  validationQueue: Array<{
    ticketKey: string;
    submittedByEmail: string;
    submittedByName: string;
    submittedAt: string;
  }>;
  collaborators: Array<{ email: string; activeSeconds: number; changes: number; tasksDone: number; score: number }>;
  recentAudit: Array<{ id: number; ticketKey: string; action: string; actorEmail: string; createdAt: string }>;
};

export type FieldTechnician = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  city: string;
  state: string;
  status: string;
  approved: boolean;
  specialties: string | null;
  vehicleType: string | null;
  fullAddress: string | null;
};

export type FinancialIssue = {
  key: string;
  title: string;
  status: string;
  technician: string;
  store: string;
  city: string;
  updatedAt: string;
  serviceValue: number;
  spareValue: number;
  totalValue: number;
  billed: boolean;
};

export type PayoutRule = { firstTicketCents: number; additionalTicketCents: number };

export type TechnicianRevenue = {
  name: string;
  tickets: number;
  revenue: number;
  payout: number;
  margin: number;
};

/** Técnico como o /api/technicians devolve para o mapa. */
export type ApiTechnician = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
  hasVehicle: string | null;
  vehicleType: string | null;
  specialties: string | null;
  availableTools: string | null;
  technicianCode: string | null;
  reviewAvg?: number | null;
  reviewCount?: number | null;
};
