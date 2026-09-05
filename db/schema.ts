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
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  baseCity: text('base_city').notNull(),
  baseState: text('base_state').notNull(),
  status: text('status', { enum: ['online', 'busy', 'break', 'offline'] }).notNull().default('offline'),
  approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
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
  status: text('status', { enum: ['Online', 'Ocupado', 'Almoçando', 'Pausa de 15 minutos', 'Offline'] }).notNull().default('Online'),
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
  readAt: text('read_at'),
}, (table) => [
  index('idx_employee_messages_sender_recipient').on(table.senderEmail, table.recipientEmail, table.createdAt),
  index('idx_employee_messages_recipient_read').on(table.recipientEmail, table.readAt),
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
