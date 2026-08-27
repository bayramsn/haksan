import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';
import { tenants, divisions } from './tenants';
import { users } from './users';
import { companies, contacts } from './companies';
import { opportunities } from './crm';
import { quotes } from './quotes';
import { serviceTickets } from './service';

export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * CRM görevleri. Proje yönetimi değil, satışın günlük yapılacak işleri:
 * "Ahmet Bey'i teklif için ara" gibi kısa, tek kişiye atanan, bir CRM kaydına
 * bağlı işler.
 *
 * İlgili kayıt polymorphic (entity_type + entity_id) değil ayrı FK kolonları
 * olarak tutuluyor — takvim ve aktivite tabloları da böyle; join'ler gerçek
 * FK üzerinden çalışıyor ve silinen kayıt görevi öksüz bırakmıyor.
 *
 * "Gecikti" kolonu YOK: son tarihi geçmiş ve kapanmamış her görev gecikmiştir,
 * bu tarihten hesaplanır. Saklanan bir gecikme durumu her gece güncellenmek
 * zorunda kalırdı.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 16 }).$type<TaskStatus>().notNull().default('todo'),
    priority: varchar('priority', { length: 16 }).$type<TaskPriority>().notNull().default('normal'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    /** Son tarih + saat tek kolonda; "tüm gün" görev için saat 23:59 yazılır. */
    dueAt: timestamp('due_at', { withTimezone: true }),
    /** Hatırlatma: son tarihten kaç dakika önce. 0 = görev saatinde, null = hatırlatma yok. */
    remindBeforeMinutes: integer('remind_before_minutes'),
    /** Hatırlatma bildirimi gönderildi işareti — aynı görev için tekrar gönderilmesin. */
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    serviceTicketId: uuid('service_ticket_id').references(() => serviceTickets.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => ({
    // "Bana atananlar" ve "bugün/geciken" listelerinin taşıyıcı indeksi.
    assigneeDueIdx: index('tasks_tenant_assignee_due_idx').on(t.tenantId, t.assignedToUserId, t.dueAt),
    tenantStatusIdx: index('tasks_tenant_status_idx').on(t.tenantId, t.status),
    companyIdx: index('tasks_company_idx').on(t.companyId),
    opportunityIdx: index('tasks_opportunity_idx').on(t.opportunityId),
    quoteIdx: index('tasks_quote_idx').on(t.quoteId),
    serviceTicketIdx: index('tasks_service_ticket_idx').on(t.serviceTicketId),
    statusCheck: check('tasks_status_check', sql`${t.status} in ('todo', 'in_progress', 'done', 'cancelled')`),
    priorityCheck: check('tasks_priority_check', sql`${t.priority} in ('low', 'normal', 'high', 'urgent')`),
  })
);

/**
 * Görev hareketleri. Müşteri/lead geçmişinde "görev atandı", "son tarih
 * değiştirildi", "tamamlandı" satırlarını gösterebilmek için tutulur; görevin
 * kendi alanlarından bu geçmiş türetilemez.
 */
export const taskEvents = pgTable(
  'task_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    /** created | assigned | status | due | completed | reopened */
    eventType: varchar('event_type', { length: 32 }).notNull(),
    /** Kullanıcıya gösterilen hazır cümle; okuma tarafı yeniden kurgulamasın. */
    summary: varchar('summary', { length: 512 }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index('task_events_task_idx').on(t.taskId, t.createdAt),
    tenantIdx: index('task_events_tenant_idx').on(t.tenantId),
  })
);
