import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

export const appUsers = sqliteTable(
  'app_users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    firebaseUid: text('firebase_uid').notNull(),
    email: text('email').notNull(),
    role: text('role', {
      enum: ['gerencia', 'coordenador', 'n1', 'analista', 'tecnico'],
    }).notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_app_users_firebase_uid').on(table.firebaseUid),
    uniqueIndex('idx_app_users_email').on(table.email),
    index('idx_app_users_role_active').on(table.role, table.active),
  ],
);

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    clientName: text('client_name').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_projects_name').on(table.name)],
);

export const stores = sqliteTable(
  'stores',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    address: text('address'),
    city: text('city').notNull(),
    state: text('state').notNull(),
    latitude: real('latitude'),
    longitude: real('longitude'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_stores_project_code').on(table.projectId, table.code),
    index('idx_stores_project_id').on(table.projectId),
  ],
);

export const technicians = sqliteTable(
  'technicians',
  {
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
    status: text('status', { enum: ['online', 'busy', 'break', 'offline'] })
      .notNull()
      .default('offline'),
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
  },
  (table) => [
    uniqueIndex('idx_technicians_email').on(table.email),
    index('idx_technicians_status').on(table.status),
  ],
);

export const tickets = sqliteTable(
  'tickets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    externalId: text('external_id').notNull(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id),
    technicianId: integer('technician_id').references(() => technicians.id),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', {
      enum: [
        'triage',
        'schedule',
        'scheduled',
        'in_progress',
        'pending',
        'validated',
        'paid',
        'cancelled',
      ],
    })
      .notNull()
      .default('triage'),
    priority: text('priority', { enum: ['low', 'medium', 'high'] })
      .notNull()
      .default('medium'),
    scheduledAt: text('scheduled_at'),
    clientValueCents: integer('client_value_cents'),
    technicianValueCents: integer('technician_value_cents'),
    source: text('source').notNull().default('manual'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_tickets_external_id').on(table.externalId),
    index('idx_tickets_status_priority').on(table.status, table.priority),
    index('idx_tickets_project_id').on(table.projectId),
    index('idx_tickets_technician_id').on(table.technicianId),
  ],
);

export const ticketHistory = sqliteTable(
  'ticket_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id),
    action: text('action').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    actorId: text('actor_id').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_ticket_history_ticket_id').on(table.ticketId)],
);

export const jiraIssueLinks = sqliteTable('jira_issue_links', {
  issueKey: text('issue_key').primaryKey(),
  whatsappUrl: text('whatsapp_url').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Eventos recebidos pela Cloud API. O `wamid` único impede que a repetição de
// webhooks da Meta duplique conversas no atendimento.
export const whatsappMessages = sqliteTable('whatsapp_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Qual número da operação trocou esta mensagem (lib/whatsapp-accounts.ts).
  account: text('account').notNull().default('principal'),
  wamid: text('wamid').notNull(),
  phoneNumberId: text('phone_number_id').notNull(),
  contactPhone: text('contact_phone'),
  contactName: text('contact_name'),
  direction: text('direction', { enum: ['incoming', 'outgoing', 'status'] }).notNull(),
  messageType: text('message_type').notNull(),
  body: text('body'),
  mediaId: text('media_id'),
  deliveryStatus: text('delivery_status'),
  senderEmail: text('sender_email'),
  // Group participant who wrote an incoming message (bridge only).
  senderJid: text('sender_jid'),
  // Reply context: the message this one quotes, as shown in WhatsApp.
  quotedWamid: text('quoted_wamid'),
  quotedBody: text('quoted_body'),
  quotedName: text('quoted_name'),
  // Set when the sender edits or deletes the message; the text stays for
  // the operation's record.
  editedAt: text('edited_at'),
  deletedAt: text('deleted_at'),
  // FSAs this media was attached to as evidence (comma-separated).
  evidenceTicketKeys: text('evidence_ticket_keys'),
  occurredAt: text('occurred_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_whatsapp_messages_wamid').on(table.wamid),
  index('idx_whatsapp_messages_contact_occurred').on(table.contactPhone, table.occurredAt),
]);

// One row per WhatsApp contact. Read state and the linked ticket live here
// instead of on every message row, since both apply to the conversation as
// a whole, not to any single message.
export const whatsappConversations = sqliteTable('whatsapp_conversations', {
  contactPhone: text('contact_phone').notNull(),
  // A conversa pertence a um dos números da operação; a resposta sai por ele.
  // Junto com o contato, forma a chave: o mesmo contato pode falar com os dois
  // números, e são conversas diferentes.
  account: text('account').notNull().default('principal'),
  contactName: text('contact_name'),
  // Phone JID of a contact WhatsApp only addresses by "@lid": learned from
  // messages or filled in by hand, and needed to create a group.
  phoneJid: text('phone_jid'),
  ticketKey: text('ticket_key'),
  assignedTo: text('assigned_to'),
  lastMessageAt: text('last_message_at').notNull(),
  lastReadAt: text('last_read_at'),
  lastReadBy: text('last_read_by'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.account, table.contactPhone] }),
]);

export const financeSettings = sqliteTable('finance_settings', {
  key: text('key').primaryKey(),
  firstTicketCents: integer('first_ticket_cents').notNull().default(7000),
  additionalTicketCents: integer('additional_ticket_cents')
    .notNull()
    .default(7000),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const employeePresence = sqliteTable('employee_presence', {
  email: text('email').primaryKey(),
  displayName: text('display_name'),
  phone: text('phone'),
  photoUrl: text('photo_url'),
  status: text('status', {
    enum: [
      'Online',
      'Ocupado',
      'Ausente',
      'Não perturbe',
      'Almoçando',
      'Pausa de 15 minutos',
      'Offline',
    ],
  })
    .notNull()
    .default('Online'),
  manualStatus: integer('manual_status', { mode: 'boolean' })
    .notNull()
    .default(false),
  lastSeenAt: text('last_seen_at'),
  updatedAt: text('updated_at').notNull(),
});

export const employeeMessages = sqliteTable(
  'employee_messages',
  {
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
  },
  (table) => [
    index('idx_employee_messages_sender_recipient').on(
      table.senderEmail,
      table.recipientEmail,
      table.createdAt,
    ),
    index('idx_employee_messages_recipient_read').on(
      table.recipientEmail,
      table.readAt,
    ),
  ],
);

export const bulletinNotes = sqliteTable(
  'bulletin_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    authorEmail: text('author_email').notNull(),
    targetName: text('target_name'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    archivedAt: text('archived_at'),
    archivedBy: text('archived_by'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_bulletin_notes_active_created').on(
      table.archivedAt,
      table.createdAt,
    ),
    index('idx_bulletin_notes_author').on(table.authorEmail, table.createdAt),
  ],
);

export const chatGroups = sqliteTable('chat_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const chatGroupMembers = sqliteTable(
  'chat_group_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    groupId: integer('group_id')
      .notNull()
      .references(() => chatGroups.id),
    email: text('email').notNull(),
    memberRole: text('member_role', { enum: ['owner', 'member'] })
      .notNull()
      .default('member'),
    joinedAt: text('joined_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_chat_group_members_group_email').on(
      table.groupId,
      table.email,
    ),
    index('idx_chat_group_members_email').on(table.email, table.groupId),
  ],
);

export const chatGroupMessages = sqliteTable(
  'chat_group_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    groupId: integer('group_id')
      .notNull()
      .references(() => chatGroups.id),
    senderEmail: text('sender_email').notNull(),
    body: text('body').notNull(),
    ticketId: text('ticket_id'),
    attachmentName: text('attachment_name'),
    attachmentType: text('attachment_type'),
    attachmentData: text('attachment_data'),
    createdAt: text('created_at').notNull(),
    editedAt: text('edited_at'),
    editHistory: text('edit_history'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('idx_chat_group_messages_group_created').on(
      table.groupId,
      table.createdAt,
    ),
  ],
);

export const chatGroupReads = sqliteTable(
  'chat_group_reads',
  {
    groupId: integer('group_id')
      .notNull()
      .references(() => chatGroups.id),
    email: text('email').notNull(),
    lastReadMessageId: integer('last_read_message_id').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_chat_group_reads_group_email').on(
      table.groupId,
      table.email,
    ),
  ],
);

export const chatTyping = sqliteTable(
  'chat_typing',
  {
    conversationKey: text('conversation_key').notNull(),
    email: text('email').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_chat_typing_conversation_email').on(
      table.conversationKey,
      table.email,
    ),
  ],
);

export const communicationPreferences = sqliteTable(
  'communication_preferences',
  {
    email: text('email').primaryKey(),
    desktopMessages: integer('desktop_messages', { mode: 'boolean' })
      .notNull()
      .default(true),
    desktopCalls: integer('desktop_calls', { mode: 'boolean' })
      .notNull()
      .default(true),
    soundMessages: integer('sound_messages', { mode: 'boolean' })
      .notNull()
      .default(true),
    soundCalls: integer('sound_calls', { mode: 'boolean' })
      .notNull()
      .default(true),
    quietHoursEnabled: integer('quiet_hours_enabled', { mode: 'boolean' })
      .notNull()
      .default(false),
    quietHoursStart: text('quiet_hours_start').notNull().default('20:00'),
    quietHoursEnd: text('quiet_hours_end').notNull().default('07:00'),
    updatedAt: text('updated_at').notNull(),
  },
);

export const voiceCallHistory = sqliteTable(
  'voice_call_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id').notNull(),
    ownerEmail: text('owner_email').notNull(),
    direction: text('direction', { enum: ['incoming', 'outgoing'] }).notNull(),
    kind: text('kind', { enum: ['direct', 'group'] }).notNull(),
    peerNames: text('peer_names').notNull(),
    status: text('status', {
      enum: ['missed', 'declined', 'completed', 'failed'],
    }).notNull(),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    durationSeconds: integer('duration_seconds').notNull().default(0),
  },
  (table) => [
    uniqueIndex('idx_voice_call_history_session_owner').on(
      table.sessionId,
      table.ownerEmail,
    ),
    index('idx_voice_call_history_owner_started').on(
      table.ownerEmail,
      table.startedAt,
    ),
  ],
);

export const technicianReviews = sqliteTable(
  'technician_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    technicianId: integer('technician_id')
      .notNull()
      .references(() => technicians.id),
    authorEmail: text('author_email').notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_technician_reviews_technician').on(
      table.technicianId,
      table.createdAt,
    ),
  ],
);

// Jira holds original request. Local workflow holds Caju operational process.
export const operationalStores = sqliteTable('operational_stores', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  requesterName: text('requester_name'),
  requesterPhone: text('requester_phone'),
  requesterRole: text('requester_role'),
  secondaryName: text('secondary_name'),
  secondaryPhone: text('secondary_phone'),
  secondaryRole: text('secondary_role'),
  updatedAt: text('updated_at').notNull(),
});

export const operationalWorkflows = sqliteTable(
  'operational_workflows',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketKey: text('ticket_key').notNull(),
    storeCode: text('store_code'),
    storeName: text('store_name'),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    openedAt: text('opened_at'),
    category: text('category'),
    pdvNumber: text('pdv_number'),
    description: text('description'),
    clientValueCents: integer('client_value_cents'),
    payoutCents: integer('payout_cents'),
    status: text('status').notNull().default('triage'),
    technicianId: integer('technician_id').references(() => technicians.id),
    scheduledAt: text('scheduled_at'),
    scheduledByEmail: text('scheduled_by_email'),
    expectedReturnAt: text('expected_return_at'),
    validationStatus: text('validation_status'),
    spareSource: text('spare_source'),
    spareStatus: text('spare_status'),
    purchaseStatus: text('purchase_status'),
    partsValueCents: integer('parts_value_cents'),
    partsSaleCents: integer('parts_sale_cents'),
    paymentDate: text('payment_date'),
    paidValueCents: integer('paid_value_cents'),
    pixKey: text('pix_key'),
    bank: text('bank'),
    accountHolder: text('account_holder'),
    pixKeyType: text('pix_key_type'),
    archivedAt: text('archived_at'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_operational_workflows_ticket').on(table.ticketKey),
    index('idx_operational_workflows_status').on(
      table.status,
      table.scheduledAt,
    ),
  ],
);

export const operationalVisits = sqliteTable(
  'operational_visits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workflowId: integer('workflow_id')
      .notNull()
      .references(() => operationalWorkflows.id),
    visitNumber: integer('visit_number').notNull(),
    technicianId: integer('technician_id').references(() => technicians.id),
    scheduledAt: text('scheduled_at'),
    expectedReturnAt: text('expected_return_at'),
    completedAt: text('completed_at'),
    clientValueCents: integer('client_value_cents'),
    payoutCents: integer('payout_cents'),
    status: text('status').notNull().default('planned'),
    note: text('note'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_operational_visits_order').on(
      table.workflowId,
      table.visitNumber,
    ),
    index('idx_operational_visits_workflow').on(table.workflowId),
  ],
);

export const n1TicketAssignments = sqliteTable('n1_ticket_assignments', {
  ticketKey: text('ticket_key').primaryKey(),
  n1Email: text('n1_email').notNull(),
  participantN1Email: text('participant_n1_email'),
  participantClaimedAt: text('participant_claimed_at'),
  status: text('status', { enum: ['claimed', 'validated'] })
    .notNull()
    .default('claimed'),
  claimedAt: text('claimed_at').notNull(),
  validatedAt: text('validated_at'),
  updatedAt: text('updated_at').notNull(),
});

export const ticketEvidence = sqliteTable(
  'ticket_evidence',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketKey: text('ticket_key').notNull(),
    kind: text('kind', { enum: ['photo', 'video', 'rat'] }).notNull(),
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    data: text('data').notNull(),
    uploadedBy: text('uploaded_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_ticket_evidence_ticket').on(table.ticketKey, table.createdAt),
  ],
);

// Append-only operational trail. Never update or delete these records.
export const operationalAudit = sqliteTable(
  'operational_audit',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketKey: text('ticket_key').notNull(),
    action: text('action').notNull(),
    actorEmail: text('actor_email').notNull(),
    details: text('details'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_operational_audit_ticket').on(table.ticketKey, table.createdAt),
  ],
);

// A sessão representa o trabalho que um colaborador declarou estar executando.
// Ela é separada do status do Jira porque um mesmo atendimento pode reunir mais
// de um chamado (por exemplo, várias FSAs na mesma loja).
export const activeAttendances = sqliteTable(
  'active_attendances',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerEmail: text('owner_email').notNull(),
    whatsappGroupName: text('whatsapp_group_name'),
    groupValueCents: integer('group_value_cents'),
    phase: text('phase').notNull().default('ongoing'),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    endedBy: text('ended_by'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_active_attendances_open_started').on(table.endedAt, table.startedAt),
    index('idx_active_attendances_owner_started').on(table.ownerEmail, table.startedAt),
  ],
);

export const activeAttendanceTickets = sqliteTable(
  'active_attendance_tickets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    attendanceId: integer('attendance_id')
      .notNull()
      .references(() => activeAttendances.id),
    ticketKey: text('ticket_key').notNull(),
    summary: text('summary').notNull(),
    store: text('store'),
    city: text('city'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_active_attendance_ticket_unique').on(
      table.attendanceId,
      table.ticketKey,
    ),
    index('idx_active_attendance_tickets_key').on(table.ticketKey),
  ],
);

// Durable outbox for Jira writes. Failed transient requests are retried from the
// administration screen without losing the user's operation.
export const jiraSyncJobs = sqliteTable(
  'jira_sync_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    issueKey: text('issue_key').notNull(),
    operation: text('operation', { enum: ['update', 'transition'] }).notNull(),
    payload: text('payload').notNull(),
    status: text('status', {
      enum: ['pending', 'processing', 'succeeded', 'failed'],
    })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull(),
    actorEmail: text('actor_email').notNull(),
    lastError: text('last_error'),
    nextAttemptAt: text('next_attempt_at').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_jira_sync_jobs_idempotency').on(table.idempotencyKey),
    index('idx_jira_sync_jobs_status_next').on(
      table.status,
      table.nextAttemptAt,
    ),
    index('idx_jira_sync_jobs_issue').on(table.issueKey, table.createdAt),
  ],
);

export const requesterHistory = sqliteTable(
  'requester_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketKey: text('ticket_key').notNull(),
    name: text('name').notNull(),
    role: text('role'),
    phone: text('phone'),
    recordedBy: text('recorded_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_requester_history_ticket').on(table.ticketKey, table.createdAt),
  ],
);

export const shipmentTracking = sqliteTable(
  'shipment_tracking',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketKey: text('ticket_key').notNull(),
    source: text('source', { enum: ['Delfia', 'Caju'] }).notNull(),
    trackingCode: text('tracking_code').notNull(),
    carrier: text('carrier'),
    status: text('status').notNull().default('Postado'),
    /** Última movimentação informada pela transportadora (TrackingMore). */
    lastEvent: text('last_event'),
    expectedAt: text('expected_at'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_shipment_tracking_code').on(
      table.ticketKey,
      table.trackingCode,
    ),
    index('idx_shipment_tracking_ticket').on(table.ticketKey, table.updatedAt),
  ],
);

// Operational spare register. The D1 row is the durable system record while
// syncStatus tells the UI whether the SharePoint workbook already received it.
export const spares = sqliteTable(
  'spares',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    externalKey: text('external_key').notNull(),
    status: text('status').notNull().default('PENDENTE'),
    ticketKey: text('ticket_key').notNull(),
    city: text('city').notNull(),
    equipment: text('equipment').notNull(),
    trackingCode: text('tracking_code'),
    expectedDelivery: text('expected_delivery'),
    technician: text('technician'),
    expectedService: text('expected_service'),
    note: text('note'),
    address: text('address'),
    supplier: text('supplier').notNull(),
    source: text('source', { enum: ['system', 'spreadsheet'] })
      .notNull()
      .default('system'),
    syncStatus: text('sync_status', { enum: ['pending', 'synced', 'failed'] })
      .notNull()
      .default('pending'),
    syncError: text('sync_error'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_spares_external_key').on(table.externalKey),
    index('idx_spares_status_updated').on(table.status, table.updatedAt),
    index('idx_spares_ticket').on(table.ticketKey, table.updatedAt),
    index('idx_spares_sync').on(table.syncStatus, table.updatedAt),
  ],
);

export const operationalTasks = sqliteTable(
  'operational_tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketKey: text('ticket_key'),
    title: text('title').notNull(),
    assignedTo: text('assigned_to'),
    acceptedBy: text('accepted_by'),
    status: text('status', {
      enum: ['open', 'accepted', 'in_progress', 'done', 'cancelled'],
    })
      .notNull()
      .default('open'),
    progressNote: text('progress_note'),
    nextCheckAt: text('next_check_at').notNull(),
    dueAt: text('due_at'),
    // Set once the manager has been notified, so the sweep does not re-escalate.
    escalatedAt: text('escalated_at'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_operational_tasks_assignee').on(
      table.assignedTo,
      table.status,
      table.nextCheckAt,
    ),
    index('idx_operational_tasks_ticket').on(table.ticketKey, table.createdAt),
  ],
);

export const employeeActivity = sqliteTable(
  'employee_activity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    event: text('event').notNull(),
    context: text('context'),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_employee_activity_email_created').on(
      table.email,
      table.createdAt,
    ),
  ],
);

export const ticketSnapshots = sqliteTable(
  'ticket_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketKey: text('ticket_key').notNull(),
    actorEmail: text('actor_email').notNull(),
    reason: text('reason').notNull(),
    snapshot: text('snapshot').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_ticket_snapshots_ticket').on(table.ticketKey, table.createdAt),
  ],
);

// Last known durable copy of a ticket. This is intentionally separate from the
// append-only audit trail: the audit explains changes, while this table keeps a
// practical, searchable record after the issue leaves the Jira queue.
export const ticketArchives = sqliteTable(
  'ticket_archives',
  {
    ticketKey: text('ticket_key').primaryKey(),
    title: text('title').notNull(),
    jiraStatus: text('jira_status'),
    operationalStatus: text('operational_status'),
    storeName: text('store_name'),
    city: text('city'),
    snapshot: text('snapshot').notNull(),
    capturedAt: text('captured_at').notNull(),
    capturedBy: text('captured_by').notNull(),
    captureReason: text('capture_reason').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_ticket_archives_captured_at').on(table.capturedAt),
    index('idx_ticket_archives_status').on(table.operationalStatus, table.capturedAt),
  ],
);

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
export const partsCatalog = sqliteTable(
  'parts_catalog',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    salePriceCents: integer('sale_price_cents').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    updatedBy: text('updated_by').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('idx_parts_catalog_name').on(table.name)],
);

// Canal aberto a todos os perfis para sugerir melhorias e relatar problemas do
// próprio sistema. Separado do chamado operacional: aqui o assunto é o Caju OS,
// não o atendimento em loja.
export const feedback = sqliteTable(
  'feedback',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    authorEmail: text('author_email').notNull(),
    kind: text('kind', { enum: ['sugestao', 'correcao'] })
      .notNull()
      .default('sugestao'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status', {
      enum: ['aberto', 'analisando', 'planejado', 'concluido', 'recusado'],
    })
      .notNull()
      .default('aberto'),
    handledBy: text('handled_by'),
    handledNote: text('handled_note'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_feedback_status_created').on(table.status, table.createdAt),
    index('idx_feedback_author').on(table.authorEmail, table.createdAt),
  ],
);

// Apoiar uma ideia existente em vez de abrir outra igual. Um voto por pessoa.
export const feedbackVotes = sqliteTable(
  'feedback_votes',
  {
    feedbackId: integer('feedback_id')
      .notNull()
      .references(() => feedback.id),
    email: text('email').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_feedback_votes_unique').on(table.feedbackId, table.email),
  ],
);

// Escrita assistida: toda proposta do assistente, confirmada ou não, fica
// registrada aqui. É a trilha que a coordenação e a gerência auditam — por
// isso a linha nasce no momento da PROPOSTA, não da execução: uma sugestão
// recusada também é informação.
export const assistantActions = sqliteTable(
  'assistant_actions',
  {
    id: text('id').primaryKey(),
    ticketKey: text('ticket_key').notNull(),
    kind: text('kind', { enum: ['comment', 'transition', 'schedule'] }).notNull(),
    // Payload da ação como proposto, em JSON. A confirmação relê daqui: o
    // cliente manda só o id, nunca o que será escrito.
    payload: text('payload').notNull(),
    description: text('description').notNull(),
    status: text('status', { enum: ['pending', 'applied', 'failed', 'cancelled'] }).notNull().default('pending'),
    proposedTo: text('proposed_to').notNull(),
    confirmedBy: text('confirmed_by'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    resolvedAt: text('resolved_at'),
  },
  (table) => [
    index('idx_assistant_actions_created').on(table.createdAt),
    index('idx_assistant_actions_ticket').on(table.ticketKey, table.createdAt),
  ],
);

// Classificação de uma FSA para efeito de repasse ao técnico.
//
// Vive só no Caju: nada disso volta para o Jira, que continua sendo a origem
// do chamado e não sabe o que é serviço, evidência ou improdutivo. Por isso a
// chave é a do ticket, e não um id próprio — cada FSA tem uma classificação só.
export const fsaClassifications = sqliteTable(
  'fsa_classifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketKey: text('ticket_key').notNull(),
    // A visita a que a FSA pertence. O repasse é calculado por atendimento,
    // porque a faixa de preço é do conjunto e não de cada chamado isolado.
    attendanceId: integer('attendance_id').references(() => activeAttendances.id),
    tipo: text('tipo', { enum: ['servico', 'evidencia'] }).notNull(),
    improdutiva: integer('improdutiva', { mode: 'boolean' }).notNull().default(false),
    motivo: text('motivo', {
      enum: [
        'gerente-recusou',
        'defeito-maior',
        'problema-impeditivo',
        'loja-fechada',
        'tempo-excedido',
        'loja-fechando',
      ],
    }),
    observacao: text('observacao'),
    // Apareceu durante a visita, fora do agendamento. Muda o valor quando o
    // recálculo pela tabela não renderia nada (4 serviços e aparece o quinto).
    descobertaNaLoja: integer('descoberta_na_loja', { mode: 'boolean' }).notNull().default(false),
    // Trocar evidência por serviço mexe no valor, então a mudança fica retida
    // até a gerência revisar. O cálculo continua rodando; o que trava é o
    // pagamento, não a edição.
    revisao: text('revisao', { enum: ['ok', 'pendente'] }).notNull().default('ok'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedBy: text('updated_by').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_fsa_classifications_ticket').on(table.ticketKey),
    index('idx_fsa_classifications_attendance').on(table.attendanceId),
  ],
);

// Repasse fechado de uma visita.
//
// O valor não é a fonte da verdade — ele sempre pode ser recalculado a partir
// das FSAs. É uma fotografia do que foi apresentado à gerência no momento da
// aprovação, para que uma reclassificação posterior não reescreva à revelia o
// que já foi aprovado ou pago.
export const fsaPayouts = sqliteTable(
  'fsa_payouts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    attendanceId: integer('attendance_id')
      .notNull()
      .references(() => activeAttendances.id),
    status: text('status', {
      enum: ['aberto', 'pronto', 'aprovado', 'pago', 'bloqueado'],
    })
      .notNull()
      .default('aberto'),
    // As três categorias da leitura, cada uma com o que rendeu. Improdutiva não
    // é desconto: soma como as outras duas, e juntas fecham o total.
    servicosCents: integer('servicos_cents').notNull().default(0),
    evidenciasCents: integer('evidencias_cents').notNull().default(0),
    improdutivasCents: integer('improdutivas_cents').notNull().default(0),
    descontoImprodutivoCents: integer('desconto_improdutivo_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    // Memória de cálculo em JSON, para o relatório explicar como chegou no valor.
    memoria: text('memoria'),
    approvedBy: text('approved_by'),
    approvedAt: text('approved_at'),
    paidAt: text('paid_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('idx_fsa_payouts_attendance').on(table.attendanceId)],
);
