import { integer, real, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const appUsers = sqliteTable('app_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firebaseUid: text('firebase_uid').notNull(),
  email: text('email').notNull(),
  role: text('role', { enum: ['gerencia', 'coordenador', 'n1', 'analista', 'tecnico'] }).notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_app_users_firebase_uid').on(table.firebaseUid),
  uniqueIndex('idx_app_users_email').on(table.email),
  index('idx_app_users_role_active').on(table.role, table.active),
]);

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  clientName: text('client_name').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('idx_projects_name').on(table.name)]);

export const stores = sqliteTable('stores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  address: text('address'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  latitude: real('latitude'),
  longitude: real('longitude'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_stores_project_code').on(table.projectId, table.code),
  index('idx_stores_project_id').on(table.projectId),
]);

export const technicians = sqliteTable('technicians', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  technicianExternalId: text('technician_external_id'),
  technicianCode: text('technician_code'),
  name: text('name').notNull(),
  cpf: text('cpf'),
  email: text('email'),
  phone: text('phone'),
  pixKey: text('pix_key'),
  age: text('age'),
  baseCity: text('base_city').notNull(),
  baseState: text('base_state').notNull(),
  fullAddress: text('full_address'),
  status: text('status', { enum: ['online', 'busy', 'break', 'offline'] }).notNull().default('offline'),
  sourceStatus: text('source_status'),
  approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
  onboardingCompleted: text('onboarding_completed'),
  hasVehicle: text('has_vehicle'),
  vehicleType: text('vehicle_type'),
  alternativeTransport: text('alternative_transport'),
  servesOtherCities: text('serves_other_cities'),
  extraCities: text('extra_cities'),
  toolsCount: text('tools_count'),
  availableTools: text('available_tools'),
  specialtiesCount: text('specialties_count'),
  specialties: text('specialties'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_technicians_email').on(table.email),
  index('idx_technicians_status').on(table.status),
]);

export const tickets = sqliteTable('tickets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  externalId: text('external_id').notNull(),
  projectId: integer('project_id').notNull().references(() => projects.id),
  storeId: integer('store_id').notNull().references(() => stores.id),
  technicianId: integer('technician_id').references(() => technicians.id),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['triage', 'schedule', 'scheduled', 'in_progress', 'pending', 'validated', 'paid', 'cancelled'] }).notNull().default('triage'),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  scheduledAt: text('scheduled_at'),
  clientValueCents: integer('client_value_cents'),
  technicianValueCents: integer('technician_value_cents'),
  source: text('source').notNull().default('manual'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_tickets_external_id').on(table.externalId),
  index('idx_tickets_status_priority').on(table.status, table.priority),
  index('idx_tickets_project_id').on(table.projectId),
  index('idx_tickets_technician_id').on(table.technicianId),
]);

export const ticketHistory = sqliteTable('ticket_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketId: integer('ticket_id').notNull().references(() => tickets.id),
  action: text('action').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  actorId: text('actor_id').notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_ticket_history_ticket_id').on(table.ticketId)]);

export const jiraIssueLinks = sqliteTable('jira_issue_links', {
  issueKey: text('issue_key').primaryKey(),
  whatsappUrl: text('whatsapp_url').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const financeSettings = sqliteTable('finance_settings', {
  key: text('key').primaryKey(),
  firstTicketCents: integer('first_ticket_cents').notNull().default(7000),
  additionalTicketCents: integer('additional_ticket_cents').notNull().default(7000),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const employeePresence = sqliteTable('employee_presence', {
  email: text('email').primaryKey(),
  displayName: text('display_name'),
  phone: text('phone'),
  photoUrl: text('photo_url'),
  status: text('status', { enum: ['Online', 'Ocupado', 'Ausente', 'Não perturbe', 'Almoçando', 'Pausa de 15 minutos', 'Offline'] }).notNull().default('Online'),
  manualStatus: integer('manual_status', { mode: 'boolean' }).notNull().default(false),
  lastSeenAt: text('last_seen_at'),
  updatedAt: text('updated_at').notNull(),
});

export const employeeMessages = sqliteTable('employee_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  senderEmail: text('sender_email').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  body: text('body').notNull(),
  attachmentName: text('attachment_name'),
  attachmentType: text('attachment_type'),
  attachmentData: text('attachment_data'),
  createdAt: text('created_at').notNull(),
  deliveredAt: text('delivered_at'),
  readAt: text('read_at'),
}, (table) => [
  index('idx_employee_messages_sender_recipient').on(table.senderEmail, table.recipientEmail, table.createdAt),
  index('idx_employee_messages_recipient_read').on(table.recipientEmail, table.readAt),
]);

export const bulletinNotes = sqliteTable('bulletin_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  authorEmail: text('author_email').notNull(),
  targetName: text('target_name'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  archivedAt: text('archived_at'),
  archivedBy: text('archived_by'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_bulletin_notes_active_created').on(table.archivedAt, table.createdAt),
  index('idx_bulletin_notes_author').on(table.authorEmail, table.createdAt),
]);

export const chatGroups = sqliteTable('chat_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const chatGroupMembers = sqliteTable('chat_group_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: integer('group_id').notNull().references(() => chatGroups.id),
  email: text('email').notNull(),
  memberRole: text('member_role', { enum: ['owner', 'member'] }).notNull().default('member'),
  joinedAt: text('joined_at').notNull(),
}, (table) => [
  uniqueIndex('idx_chat_group_members_group_email').on(table.groupId, table.email),
  index('idx_chat_group_members_email').on(table.email, table.groupId),
]);

export const chatGroupMessages = sqliteTable('chat_group_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: integer('group_id').notNull().references(() => chatGroups.id),
  senderEmail: text('sender_email').notNull(),
  body: text('body').notNull(),
  ticketId: text('ticket_id'),
  attachmentName: text('attachment_name'),
  attachmentType: text('attachment_type'),
  attachmentData: text('attachment_data'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_chat_group_messages_group_created').on(table.groupId, table.createdAt)]);

export const chatGroupReads = sqliteTable('chat_group_reads', {
  groupId: integer('group_id').notNull().references(() => chatGroups.id),
  email: text('email').notNull(),
  lastReadMessageId: integer('last_read_message_id').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_chat_group_reads_group_email').on(table.groupId, table.email)]);

export const chatTyping = sqliteTable('chat_typing', {
  conversationKey: text('conversation_key').notNull(),
  email: text('email').notNull(),
  expiresAt: text('expires_at').notNull(),
}, (table) => [uniqueIndex('idx_chat_typing_conversation_email').on(table.conversationKey, table.email)]);

export const communicationPreferences = sqliteTable('communication_preferences', {
  email: text('email').primaryKey(),
  desktopMessages: integer('desktop_messages', { mode: 'boolean' }).notNull().default(true),
  desktopCalls: integer('desktop_calls', { mode: 'boolean' }).notNull().default(true),
  soundMessages: integer('sound_messages', { mode: 'boolean' }).notNull().default(true),
  soundCalls: integer('sound_calls', { mode: 'boolean' }).notNull().default(true),
  quietHoursEnabled: integer('quiet_hours_enabled', { mode: 'boolean' }).notNull().default(false),
  quietHoursStart: text('quiet_hours_start').notNull().default('20:00'),
  quietHoursEnd: text('quiet_hours_end').notNull().default('07:00'),
  updatedAt: text('updated_at').notNull(),
});

export const voiceCallHistory = sqliteTable('voice_call_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  ownerEmail: text('owner_email').notNull(),
  direction: text('direction', { enum: ['incoming', 'outgoing'] }).notNull(),
  kind: text('kind', { enum: ['direct', 'group'] }).notNull(),
  peerNames: text('peer_names').notNull(),
  status: text('status', { enum: ['missed', 'declined', 'completed', 'failed'] }).notNull(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  durationSeconds: integer('duration_seconds').notNull().default(0),
}, (table) => [
  uniqueIndex('idx_voice_call_history_session_owner').on(table.sessionId, table.ownerEmail),
  index('idx_voice_call_history_owner_started').on(table.ownerEmail, table.startedAt),
]);

export const technicianReviews = sqliteTable('technician_reviews', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  technicianId: integer('technician_id').notNull().references(() => technicians.id),
  authorEmail: text('author_email').notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_technician_reviews_technician').on(table.technicianId, table.createdAt),
]);

// Jira holds original request. Local workflow holds Caju operational process.
export const operationalStores = sqliteTable('operational_stores', {
  code: text('code').primaryKey(), name: text('name').notNull(), address: text('address').notNull(), city: text('city').notNull(), state: text('state').notNull(),
  requesterName: text('requester_name'), requesterPhone: text('requester_phone'), requesterRole: text('requester_role'),
  secondaryName: text('secondary_name'), secondaryPhone: text('secondary_phone'), secondaryRole: text('secondary_role'), updatedAt: text('updated_at').notNull(),
});

export const operationalWorkflows = sqliteTable('operational_workflows', {
  id: integer('id').primaryKey({ autoIncrement: true }), ticketKey: text('ticket_key').notNull(), storeCode: text('store_code'), storeName: text('store_name'), address: text('address'), city: text('city'), state: text('state'),
  openedAt: text('opened_at'), category: text('category'), pdvNumber: text('pdv_number'), description: text('description'), clientValueCents: integer('client_value_cents'), payoutCents: integer('payout_cents'),
  status: text('status').notNull().default('triage'), technicianId: integer('technician_id').references(() => technicians.id), scheduledAt: text('scheduled_at'), expectedReturnAt: text('expected_return_at'), validationStatus: text('validation_status'),
  spareSource: text('spare_source'), spareStatus: text('spare_status'), purchaseStatus: text('purchase_status'), partsValueCents: integer('parts_value_cents'), partsSaleCents: integer('parts_sale_cents'),
  paymentDate: text('payment_date'), paidValueCents: integer('paid_value_cents'), pixKey: text('pix_key'), bank: text('bank'), accountHolder: text('account_holder'), pixKeyType: text('pix_key_type'), archivedAt: text('archived_at'),
  createdBy: text('created_by').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_operational_workflows_ticket').on(table.ticketKey), index('idx_operational_workflows_status').on(table.status, table.scheduledAt)]);

export const operationalVisits = sqliteTable('operational_visits', {
  id: integer('id').primaryKey({ autoIncrement: true }), workflowId: integer('workflow_id').notNull().references(() => operationalWorkflows.id), visitNumber: integer('visit_number').notNull(), technicianId: integer('technician_id').references(() => technicians.id),
  scheduledAt: text('scheduled_at'), expectedReturnAt: text('expected_return_at'), completedAt: text('completed_at'), clientValueCents: integer('client_value_cents'), payoutCents: integer('payout_cents'), status: text('status').notNull().default('planned'), note: text('note'), createdBy: text('created_by').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('idx_operational_visits_order').on(table.workflowId, table.visitNumber), index('idx_operational_visits_workflow').on(table.workflowId)]);

export const n1TicketAssignments = sqliteTable('n1_ticket_assignments', {
  ticketKey: text('ticket_key').primaryKey(),
  n1Email: text('n1_email').notNull(),
  status: text('status', { enum: ['claimed', 'validated'] }).notNull().default('claimed'),
  claimedAt: text('claimed_at').notNull(),
  validatedAt: text('validated_at'),
  updatedAt: text('updated_at').notNull(),
});

export const ticketEvidence = sqliteTable('ticket_evidence', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketKey: text('ticket_key').notNull(),
  kind: text('kind', { enum: ['photo', 'video', 'rat'] }).notNull(),
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  data: text('data').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_ticket_evidence_ticket').on(table.ticketKey, table.createdAt)]);

// Append-only operational trail. Never update or delete these records.
export const operationalAudit = sqliteTable('operational_audit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketKey: text('ticket_key').notNull(),
  action: text('action').notNull(),
  actorEmail: text('actor_email').notNull(),
  details: text('details'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_operational_audit_ticket').on(table.ticketKey, table.createdAt)]);

// Durable outbox for Jira writes. Failed transient requests are retried from the
// administration screen without losing the user's operation.
export const jiraSyncJobs = sqliteTable('jira_sync_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  issueKey: text('issue_key').notNull(),
  operation: text('operation', { enum: ['update', 'transition'] }).notNull(),
  payload: text('payload').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'succeeded', 'failed'] }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  idempotencyKey: text('idempotency_key').notNull(),
  actorEmail: text('actor_email').notNull(),
  lastError: text('last_error'),
  nextAttemptAt: text('next_attempt_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_jira_sync_jobs_idempotency').on(table.idempotencyKey),
  index('idx_jira_sync_jobs_status_next').on(table.status, table.nextAttemptAt),
  index('idx_jira_sync_jobs_issue').on(table.issueKey, table.createdAt),
]);

export const requesterHistory = sqliteTable('requester_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketKey: text('ticket_key').notNull(),
  name: text('name').notNull(),
  role: text('role'),
  phone: text('phone'),
  recordedBy: text('recorded_by').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_requester_history_ticket').on(table.ticketKey, table.createdAt)]);

export const shipmentTracking = sqliteTable('shipment_tracking', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketKey: text('ticket_key').notNull(),
  source: text('source', { enum: ['Delfia', 'Caju'] }).notNull(),
  trackingCode: text('tracking_code').notNull(),
  carrier: text('carrier'),
  status: text('status').notNull().default('Postado'),
  expectedAt: text('expected_at'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_shipment_tracking_code').on(table.ticketKey, table.trackingCode),
  index('idx_shipment_tracking_ticket').on(table.ticketKey, table.updatedAt),
]);

export const operationalTasks = sqliteTable('operational_tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketKey: text('ticket_key'),
  title: text('title').notNull(),
  assignedTo: text('assigned_to'),
  acceptedBy: text('accepted_by'),
  status: text('status', { enum: ['open', 'accepted', 'in_progress', 'done', 'cancelled'] }).notNull().default('open'),
  progressNote: text('progress_note'),
  nextCheckAt: text('next_check_at').notNull(),
  dueAt: text('due_at'),
  // Set once the manager has been notified, so the sweep does not re-escalate.
  escalatedAt: text('escalated_at'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_operational_tasks_assignee').on(table.assignedTo, table.status, table.nextCheckAt),
  index('idx_operational_tasks_ticket').on(table.ticketKey, table.createdAt),
]);

export const employeeActivity = sqliteTable('employee_activity', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  event: text('event').notNull(),
  context: text('context'),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_employee_activity_email_created').on(table.email, table.createdAt)]);

export const ticketSnapshots = sqliteTable('ticket_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketKey: text('ticket_key').notNull(),
  actorEmail: text('actor_email').notNull(),
  reason: text('reason').notNull(),
  snapshot: text('snapshot').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_ticket_snapshots_ticket').on(table.ticketKey, table.createdAt)]);

// Coordenadas de cidades que não têm técnico e por isso não estão em
// technician-map.json. Resolvidas sob demanda no Nominatim e guardadas aqui
// para não repetir a chamada — a política de uso deles pede cache.
export const geocodeCache = sqliteTable('geocode_cache', {
  query: text('query').primaryKey(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  label: text('label').notNull(),
  createdAt: text('created_at').notNull(),
});

// Tabela de preços das peças vendidas. Alimenta o campo de venda de peças do
// chamado, que antes era digitado à mão a cada atendimento.
export const partsCatalog = sqliteTable('parts_catalog', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  salePriceCents: integer('sale_price_cents').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_parts_catalog_name').on(table.name)]);

// Canal aberto a todos os perfis para sugerir melhorias e relatar problemas do
// próprio sistema. Separado do chamado operacional: aqui o assunto é o Caju OS,
// não o atendimento em loja.
export const feedback = sqliteTable('feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  authorEmail: text('author_email').notNull(),
  kind: text('kind', { enum: ['sugestao', 'correcao'] }).notNull().default('sugestao'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  status: text('status', { enum: ['aberto', 'analisando', 'planejado', 'concluido', 'recusado'] }).notNull().default('aberto'),
  handledBy: text('handled_by'),
  handledNote: text('handled_note'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_feedback_status_created').on(table.status, table.createdAt),
  index('idx_feedback_author').on(table.authorEmail, table.createdAt),
]);

// Apoiar uma ideia existente em vez de abrir outra igual. Um voto por pessoa.
export const feedbackVotes = sqliteTable('feedback_votes', {
  feedbackId: integer('feedback_id').notNull().references(() => feedback.id),
  email: text('email').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('idx_feedback_votes_unique').on(table.feedbackId, table.email)]);
