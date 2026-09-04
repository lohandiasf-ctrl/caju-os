import { integer, real, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const appUsers = sqliteTable('app_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firebaseUid: text('firebase_uid').notNull(),
  email: text('email').notNull(),
  role: text('role', { enum: ['gerencia', 'n1', 'analista'] }).notNull(),
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
