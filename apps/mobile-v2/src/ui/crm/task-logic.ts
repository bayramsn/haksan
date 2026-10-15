/** Web TasksPage / TaskCompletionDialog kuralları; saf mantık. */

export const TASK_COMPLETION_NOTE_MAX_LENGTH = 480;

export const TASK_STATUS_OPTIONS = [
  { value: 'todo', label: 'Yapılacak' },
  { value: 'in_progress', label: 'Devam Ediyor' },
  { value: 'done', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal Edildi' },
] as const;

export const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Düşük' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'urgent', label: 'Acil' },
] as const;

export const TASK_SORT_OPTIONS = [
  { value: 'dueAt', label: 'Son tarihe göre' },
  { value: 'priority', label: 'Önceliğe göre' },
  { value: 'createdAt', label: 'Oluşturulmaya göre' },
  { value: 'status', label: 'Duruma göre' },
] as const;

export type TaskSortValue = (typeof TASK_SORT_OPTIONS)[number]['value'];

/** Web: oluşturulma tarihi yeniden eskiye, diğerleri artan. */
export function taskSortDir(sortBy: TaskSortValue): 'asc' | 'desc' {
  return sortBy === 'createdAt' ? 'desc' : 'asc';
}

export type TaskFilterState = {
  status: string;
  priority: string;
  assignedToUserId: string;
  createdBy: string;
};

export type TaskViewValue = 'all' | 'mine' | 'today' | 'overdue' | 'upcoming' | 'completed' | 'history';

/** Web TASK_VIEWS sırası ve etiketleri. */
export const TASK_VIEWS: { value: Exclude<TaskViewValue, 'completed'>; label: string }[] = [
  { value: 'all', label: 'Tüm Görevler' },
  { value: 'mine', label: 'Bana Atananlar' },
  { value: 'today', label: 'Bugün' },
  { value: 'overdue', label: 'Gecikenler' },
  { value: 'upcoming', label: 'Yaklaşan' },
  { value: 'history', label: 'Geçmiş' },
];

export const TASK_EMPTY_BY_VIEW: Record<TaskViewValue, string> = {
  all: 'Henüz görev yok. Sağ üstten ilk görevi oluşturun.',
  mine: 'Size atanmış açık görev yok.',
  today: 'Bugün için görev yok.',
  overdue: 'Geciken görev yok.',
  upcoming: 'Yaklaşan görev yok.',
  completed: 'Tamamlanmış görev yok.',
  history: 'Henüz tamamlanan veya iptal edilen görev yok.',
};

export const EMPTY_TASK_FILTERS: TaskFilterState = { status: '', priority: '', assignedToUserId: '', createdBy: '' };

/** Web TasksPage.load parametreleri; boş filtreler gönderilmez. */
export function buildTaskListQuery(input: {
  view: TaskViewValue;
  search: string;
  filters: TaskFilterState;
  sortBy: TaskSortValue;
}) {
  const search = input.search.trim();
  return {
    view: input.view,
    ...(search ? { search } : {}),
    ...(input.filters.status ? { status: input.filters.status } : {}),
    ...(input.filters.priority ? { priority: input.filters.priority } : {}),
    ...(input.filters.assignedToUserId ? { assignedToUserId: input.filters.assignedToUserId } : {}),
    ...(input.filters.createdBy ? { createdBy: input.filters.createdBy } : {}),
    sortBy: input.sortBy,
    sortDir: taskSortDir(input.sortBy),
  };
}

/** Ekip özeti satırı: "3 açık · 1 geciken · 5 tamamlanan" (web metni). */
export function taskSummaryLine(row: { open: number; overdue: number; completed: number }): string {
  return `${row.open} açık${row.overdue > 0 ? ` · ${row.overdue} geciken` : ''} · ${row.completed} tamamlanan`;
}

export function activeTaskFilterCount(filters: TaskFilterState): number {
  return [filters.status, filters.priority, filters.assignedToUserId, filters.createdBy].filter(Boolean).length;
}

export type CompletionResult =
  | { ok: true; patch: { status: 'done'; completionNote: string } }
  | { ok: false; error: string };

/** Sunucu `status: done` için 1..480 karakter tamamlama notu ister. */
export function buildCompletionPatch(note: string): CompletionResult {
  const trimmed = note.trim();
  if (!trimmed) return { ok: false, error: 'Not yazmadan görev tamamlanamaz.' };
  if (trimmed.length > TASK_COMPLETION_NOTE_MAX_LENGTH) {
    return { ok: false, error: `Not en fazla ${TASK_COMPLETION_NOTE_MAX_LENGTH} karakter olabilir.` };
  }
  return { ok: true, patch: { status: 'done', completionNote: trimmed } };
}

type RelatedTask = {
  company?: { id: string; legalTitle: string; shortName: string | null } | null;
  contact?: { id: string; fullName: string } | null;
  opportunity?: { id: string; title: string } | null;
  quote?: { id: string; documentNo: string } | null;
  serviceTicket?: { id: string; ticketNo: string; subject: string } | null;
};

/** İlgili kayıtlara gidiş: web TaskDetailPanel'deki bağlantıların mobil karşılığı. */
export function taskRelatedLinks(task: RelatedTask): { label: string; kind: string; route: string }[] {
  const links: { label: string; kind: string; route: string }[] = [];
  if (task.company) {
    links.push({ kind: 'Firma', label: task.company.shortName || task.company.legalTitle, route: `/(tabs)/modules/companies/${task.company.id}` });
  }
  if (task.contact) links.push({ kind: 'Kontak', label: task.contact.fullName, route: `/(tabs)/modules/contacts/${task.contact.id}` });
  if (task.opportunity) {
    links.push({ kind: 'Satış Kartı', label: task.opportunity.title, route: `/(tabs)/modules/opportunities/${task.opportunity.id}` });
  }
  if (task.quote) links.push({ kind: 'Teklif', label: task.quote.documentNo, route: `/(tabs)/modules/quotes/${task.quote.id}` });
  if (task.serviceTicket) {
    links.push({
      kind: 'Servis',
      label: `${task.serviceTicket.ticketNo} · ${task.serviceTicket.subject}`,
      route: `/(tabs)/modules/service-tickets/${task.serviceTicket.id}`,
    });
  }
  return links;
}

/** Yönetici olmayan kullanıcı yalnız kendi oluşturduğu görevi silebilir (sunucu da denetler). */
export function canDeleteTask(input: { canDelete: boolean; canManage: boolean; createdBy?: string | null; userId?: string }): boolean {
  if (!input.canDelete) return false;
  if (input.canManage) return true;
  return Boolean(input.userId && input.createdBy === input.userId);
}
