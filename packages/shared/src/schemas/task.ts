import { z } from 'zod';

export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'cancelled'] as const;
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  done: 'Tamamlandı',
  cancelled: 'İptal Edildi',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  urgent: 'Acil',
};

/** Hatırlatma seçenekleri: son tarihten kaç dakika önce. */
export const TASK_REMINDER_OPTIONS = [
  { minutes: 0, label: 'Görev saatinde' },
  { minutes: 15, label: '15 dakika önce' },
  { minutes: 30, label: '30 dakika önce' },
  { minutes: 60, label: '1 saat önce' },
  { minutes: 1440, label: '1 gün önce' },
] as const;

const optionalId = z.string().uuid().nullable().optional();

const taskFields = z.object({
  title: z.string().trim().min(1, 'Görev adı zorunlu').max(255),
  description: z.string().trim().max(4000).nullable().optional(),
  status: taskStatusSchema.default('todo'),
  priority: taskPrioritySchema.default('normal'),
  assignedToUserId: optionalId,
  dueAt: z.coerce.date().nullable().optional(),
  remindBeforeMinutes: z.coerce.number().int().min(0).max(20160).nullable().optional(),
  companyId: optionalId,
  contactId: optionalId,
  opportunityId: optionalId,
  quoteId: optionalId,
  serviceTicketId: optionalId,
});

export const taskCreateSchema = taskFields;
export const taskUpdateSchema = taskFields.partial();

/** Görev detayındaki ekip yorumu; task_events akışında değişmez bir kayıt olur. */
export const taskCommentSchema = z.object({
  comment: z.string().trim().min(1, 'Yorum boş bırakılamaz').max(512, 'Yorum en fazla 512 karakter olabilir'),
});

/**
 * Liste filtreleri. `view` hazır görünümlerin kısayolu; tarih hesabı sunucuda
 * yapılır ki "bugün" her istemcide aynı anlama gelsin.
 */
export const taskListQuerySchema = z.object({
  view: z.enum(['all', 'mine', 'today', 'overdue', 'upcoming', 'completed']).default('all'),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assignedToUserId: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
  serviceTicketId: z.string().uuid().optional(),
  /** İlgili kayıt türü filtresi; 'none' = hiçbir kayda bağlı olmayanlar. */
  relatedType: z.enum(['company', 'contact', 'opportunity', 'quote', 'service_ticket', 'none']).optional(),
  search: z.string().trim().max(120).optional(),
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  sortBy: z.enum(['dueAt', 'priority', 'createdAt', 'status']).default('dueAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .transform((n) => Math.min(Math.max(n, 1), 200))
    .default(50),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type TaskCommentInput = z.infer<typeof taskCommentSchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
export type TaskView = TaskListQuery['view'];
