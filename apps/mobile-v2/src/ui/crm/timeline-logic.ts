/**
 * Firma "Geçmiş" sekmesi: web CustomerDetail buildCustomerTimeline + görev
 * hareketleri. Yalnız ekranda zaten yüklü kayıtlardan üretilir (ek istek yok).
 */

export type TimelineSource = {
  activities?: {
    id: string;
    subject: string;
    description: string | null;
    result: string | null;
    activityDate: string;
    type: { name: string } | null;
    createdByUser: { fullName: string } | null;
  }[];
  taskEvents?: { id: string; taskId: string; taskTitle: string; summary: string; createdAt: string; actorName: string | null }[];
  quotes?: { id: string; documentNo: string; quoteDate: string; status?: { name: string } | null }[];
  opportunities?: { id: string; title: string; createdAt?: string | null; requestedMachine?: string | null }[];
};

export type TimelineItem = {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string | null;
  meta: string | null;
  route: string | null;
};

function time(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function buildCompanyTimeline(source: TimelineSource): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const activity of source.activities ?? []) {
    items.push({
      id: `activity:${activity.id}`,
      date: activity.activityDate,
      type: activity.type?.name ?? 'Aktivite',
      title: activity.subject,
      description: activity.result || activity.description || null,
      meta: activity.createdByUser?.fullName ?? null,
      route: `/modules/activities/${activity.id}`,
    });
  }
  for (const event of source.taskEvents ?? []) {
    items.push({
      id: `task-event:${event.id}`,
      date: event.createdAt,
      type: 'Görev',
      title: event.summary,
      description: event.taskTitle,
      meta: event.actorName,
      route: `/modules/tasks/${event.taskId}`,
    });
  }
  for (const quote of source.quotes ?? []) {
    items.push({
      id: `quote:${quote.id}`,
      date: quote.quoteDate,
      type: 'Teklif',
      title: quote.documentNo,
      description: quote.status?.name ?? null,
      meta: null,
      route: `/modules/quotes/${quote.id}`,
    });
  }
  for (const opportunity of source.opportunities ?? []) {
    if (!opportunity.createdAt) continue;
    items.push({
      id: `opportunity:${opportunity.id}`,
      date: opportunity.createdAt,
      type: 'Satış Kartı',
      title: opportunity.title,
      description: opportunity.requestedMachine ?? null,
      meta: null,
      route: `/modules/opportunities/${opportunity.id}`,
    });
  }
  return items.sort((a, b) => time(b.date) - time(a.date));
}
