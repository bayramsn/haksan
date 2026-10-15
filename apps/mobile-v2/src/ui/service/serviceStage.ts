/**
 * Web ServicePages.tsx / store.tsx servis aşaması modelinin saf kopyası.
 * Sunucu `metadata.serviceStage` alanını saklar; yoksa durum kodundan türetilir.
 */

export const SERVICE_STAGES = [
  'Request Opened',
  'Diagnosis',
  'Quote Needed',
  'Quote Sent',
  'Approval',
  'Scheduled',
  'Service In Progress',
  'Service Completed',
  'Signed Form',
  'Closed',
] as const;
export type ServiceStage = (typeof SERVICE_STAGES)[number];

export const STAGE_LABELS: Record<ServiceStage, string> = {
  'Request Opened': 'Servis Talep',
  Diagnosis: 'Müşteri İletişim',
  'Quote Needed': 'Teklif Gerekli',
  'Quote Sent': 'Servis Teklifi',
  Approval: 'Onay Bekliyor',
  Scheduled: 'Planlandı',
  'Service In Progress': 'Servis Devam Ediyor',
  'Service Completed': 'Servis Tamamlandı',
  'Signed Form': 'Tamamlandı Formu',
  Closed: 'Kapandı',
};

export const SERVICE_NEXT_ACTION: Record<ServiceStage, string> = {
  'Request Opened': 'İlk değerlendirme',
  Diagnosis: 'Arıza teşhisi',
  'Quote Needed': 'Teklif hazırla',
  'Quote Sent': 'Müşteri takibi',
  Approval: 'Onay kararı',
  Scheduled: 'Saha planını başlat',
  'Service In Progress': 'İşi ve süreyi kaydet',
  'Service Completed': 'Tamamlama formu',
  'Signed Form': 'Kaydı kapat',
  Closed: 'Arşiv kaydı',
};

/** store.tsx `moveService` codeMap ile birebir. */
export const STAGE_STATUS_CODE: Record<ServiceStage, 'open' | 'in_progress' | 'resolved' | 'closed'> = {
  'Request Opened': 'open',
  Diagnosis: 'in_progress',
  'Quote Needed': 'in_progress',
  'Quote Sent': 'in_progress',
  Approval: 'in_progress',
  Scheduled: 'in_progress',
  'Service In Progress': 'in_progress',
  'Service Completed': 'resolved',
  'Signed Form': 'resolved',
  Closed: 'closed',
};

export type KanbanColumnKey =
  | 'Servis Talep'
  | 'Müşteri İletişim'
  | 'Servis Teklifi'
  | 'Bakım/Onarım & Yedek Parça'
  | 'Servis Devam Ediyor'
  | 'Servis Tamamlandı Formu';

export const KANBAN_COLUMNS: { key: KanbanColumnKey; stages: ServiceStage[]; primary: ServiceStage }[] = [
  { key: 'Servis Talep', stages: ['Request Opened'], primary: 'Request Opened' },
  { key: 'Müşteri İletişim', stages: ['Diagnosis'], primary: 'Diagnosis' },
  { key: 'Servis Teklifi', stages: ['Quote Needed', 'Quote Sent', 'Approval'], primary: 'Quote Sent' },
  { key: 'Bakım/Onarım & Yedek Parça', stages: ['Scheduled'], primary: 'Scheduled' },
  { key: 'Servis Devam Ediyor', stages: ['Service In Progress'], primary: 'Service In Progress' },
  { key: 'Servis Tamamlandı Formu', stages: ['Service Completed', 'Signed Form', 'Closed'], primary: 'Signed Form' },
];

export function isServiceStage(value: unknown): value is ServiceStage {
  return typeof value === 'string' && (SERVICE_STAGES as readonly string[]).includes(value);
}

type StageSource = { metadata?: Record<string, unknown> | null; status?: { code?: string | null } | null };

export function serviceStageOf(ticket: StageSource): ServiceStage {
  const stored = ticket.metadata?.serviceStage;
  if (isServiceStage(stored)) return stored;
  const code = ticket.status?.code;
  if (code === 'closed') return 'Closed';
  if (code === 'resolved') return 'Service Completed';
  if (code === 'in_progress') return 'Diagnosis';
  return 'Request Opened';
}

export function columnOf(stage: ServiceStage): KanbanColumnKey {
  return KANBAN_COLUMNS.find((column) => column.stages.includes(stage))!.key;
}

/**
 * Kolon seçimi → sunucu gövdesi. "Servis Tamamlandı Formu" web'de doğrudan
 * Signed Form'a değil, Service Completed'a taşır (form ayrıca doldurulur).
 */
export function moveTarget(columnKey: KanbanColumnKey, current: ServiceStage): { statusCode: string; serviceStage: ServiceStage } | null {
  const column = KANBAN_COLUMNS.find((item) => item.key === columnKey);
  if (!column) return null;
  if (column.key === 'Servis Tamamlandı Formu') {
    if (column.stages.includes(current)) return null;
    return { statusCode: STAGE_STATUS_CODE['Service Completed'], serviceStage: 'Service Completed' };
  }
  if (column.stages.includes(current) && current === column.primary) return null;
  return { statusCode: STAGE_STATUS_CODE[column.primary], serviceStage: column.primary };
}

export function stageTarget(stage: ServiceStage): { statusCode: string; serviceStage: ServiceStage } {
  return { statusCode: STAGE_STATUS_CODE[stage], serviceStage: stage };
}

const ACTIVITY_STAGES = new Set<ServiceStage>(['Service In Progress', 'Service Completed', 'Signed Form', 'Closed']);
const FEE_STAGES = new Set<ServiceStage>(['Service Completed', 'Signed Form', 'Closed']);

export type ServiceDetailTab = 'activities' | 'operations' | 'completion';

/** Web isServiceDetailTabEnabled kuralı. */
export function isDetailTabEnabled(stage: ServiceStage, tab: ServiceDetailTab): boolean {
  if (tab === 'operations') return FEE_STAGES.has(stage);
  return ACTIVITY_STAGES.has(stage);
}

/* ---------------------------------------------------------- etiketler ---- */

export const TICKET_TYPE_LABELS: Record<string, string> = {
  complaint: 'Şikayet',
  request: 'Talep',
  warranty_claim: 'Garanti',
  question: 'Soru',
};

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'İç kayıt',
  phone: 'Telefon',
  email: 'E-posta',
  whatsapp: 'WhatsApp',
  portal: 'Portal',
  web: 'Web',
  qr: 'QR',
};

export const WARRANTY_STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  submitted: 'Onay bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  rma_in_progress: "RMA'da",
  closed: 'Kapandı',
};

export const SEVERITY_LABELS: Record<string, string> = {
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  critical: 'Kritik',
};

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  new: 'Yeni',
  reviewing: 'İnceleniyor',
  converted: 'Servise Çevrildi',
  rejected: 'Reddedildi',
};

export const COMPLAINT_SOURCE_LABELS: Record<string, string> = {
  qr: 'QR',
  web: 'Web',
  phone: 'Telefon',
  whatsapp: 'WhatsApp',
  email: 'E-posta',
  manual: 'İç kayıt',
};

/* ---------------------------------------------------------- SLA / KPI ---- */

const SLA_DAYS: Record<string, number> = { critical: 1, high: 2, normal: 7, low: 14 };
const DAY_MS = 24 * 60 * 60 * 1000;

type SlaSource = StageSource & { severity: string; reportedAt: string };

export function ticketAgeDays(ticket: { reportedAt: string }, now: number): number {
  const time = new Date(ticket.reportedAt).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((now - time) / DAY_MS));
}

export function isSlaOverdue(ticket: SlaSource, now: number): boolean {
  if (serviceStageOf(ticket) === 'Closed') return false;
  const target = SLA_DAYS[ticket.severity] ?? SLA_DAYS.normal!;
  return target - ticketAgeDays(ticket, now) < 0;
}

export type TicketKpis = { open: number; urgent: number; slaOverdue: number; assigned: number; total: number };

export function ticketKpis(tickets: (SlaSource & { assignedToUserId: string | null })[], now: number): TicketKpis {
  let open = 0;
  let urgent = 0;
  let slaOverdue = 0;
  let assigned = 0;
  for (const ticket of tickets) {
    if (serviceStageOf(ticket) !== 'Closed') open += 1;
    if (ticket.severity === 'critical' || ticket.severity === 'high') urgent += 1;
    if (isSlaOverdue(ticket, now)) slaOverdue += 1;
    if (ticket.assignedToUserId) assigned += 1;
  }
  return { open, urgent, slaOverdue, assigned, total: tickets.length };
}

export function columnStats(tickets: SlaSource[], now: number): { avgAgeDays: number; slaOverdue: number } {
  if (!tickets.length) return { avgAgeDays: 0, slaOverdue: 0 };
  const totalAge = tickets.reduce((sum, ticket) => sum + ticketAgeDays(ticket, now), 0);
  return {
    avgAgeDays: Math.round(totalAge / tickets.length),
    slaOverdue: tickets.filter((ticket) => isSlaOverdue(ticket, now)).length,
  };
}

export type TicketFilters = { ticketType?: string | null; source?: string | null; warranty?: string | null };

/** Sunucu yalnız arama/faz/öncelik filtreler; web'deki diğer filtreler istemci tarafında. */
export function filterTickets<T extends { ticketType: string; source: string; warrantyClaim: { status: string } | null }>(
  tickets: T[],
  filters: TicketFilters,
): T[] {
  return tickets.filter((ticket) => {
    if (filters.ticketType && ticket.ticketType !== filters.ticketType) return false;
    if (filters.source && (ticket.source || 'manual') !== filters.source) return false;
    if (filters.warranty) {
      const status = ticket.warrantyClaim?.status ?? (ticket.ticketType === 'warranty_claim' ? 'draft' : null);
      if (status !== filters.warranty) return false;
    }
    return true;
  });
}

/** Firma konum etiketi: ilçe ve il varsa birleşir; hiçbiri yoksa satır gizlenir. */
export function locationLabel(point: { district?: string | null; province?: string | null } | null | undefined): string | null {
  if (!point) return null;
  const parts = [point.district, point.province].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(', ') : null;
}

/* -------------------------------------------------------- metadata ---- */

export type HistoryItem = { id: string; text: string; createdAt: string; byUserId?: string };
export type ServiceOperation = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  kind?: 'labor' | 'part';
  createdAt?: string;
  byUserId?: string;
};

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}

export function readHistory(metadata: Record<string, unknown> | null | undefined, key: 'noteHistory' | 'activityHistory' | 'complaints'): HistoryItem[] {
  return asRecordArray(metadata?.[key])
    .filter((item) => typeof item.text === 'string')
    .map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `${key}-${index}`,
      text: item.text as string,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      byUserId: typeof item.byUserId === 'string' ? item.byUserId : undefined,
    }));
}

export function readOperations(metadata: Record<string, unknown> | null | undefined): ServiceOperation[] {
  return asRecordArray(metadata?.operations)
    .filter((item) => typeof item.description === 'string')
    .map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `op-${index}`,
      description: item.description as string,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      currency: typeof item.currency === 'string' ? item.currency : 'USD',
      kind: item.kind === 'part' || item.kind === 'labor' ? item.kind : undefined,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
      byUserId: typeof item.byUserId === 'string' ? item.byUserId : undefined,
    }));
}

export function isPartOperation(operation: ServiceOperation): boolean {
  return (
    operation.kind === 'part' ||
    operation.id.startsWith('srv-part-') ||
    operation.description.trim().toLocaleLowerCase('tr-TR').startsWith('parça kullanımı:')
  );
}

/** Web `timestamp()` biçimi: "YYYY-MM-DD HH:mm" (UTC). */
export function historyTimestamp(now: Date): string {
  return now.toISOString().slice(0, 16).replace('T', ' ');
}

export function makeHistoryItem(prefix: string, text: string, now: Date, byUserId?: string): HistoryItem {
  return { id: `${prefix}-${now.getTime()}`, text, createdAt: historyTimestamp(now), ...(byUserId ? { byUserId } : {}) };
}

export type TimerState = { status: 'idle' | 'running' | 'paused' | 'stopped'; startedAt: string | null; elapsedSeconds: number };

export function readTimer(metadata: Record<string, unknown> | null | undefined): TimerState {
  const raw = metadata?.timerStatus;
  const status = raw === 'running' || raw === 'paused' || raw === 'stopped' ? raw : 'idle';
  return {
    status,
    startedAt: typeof metadata?.timerStartedAt === 'string' ? metadata.timerStartedAt : null,
    elapsedSeconds: Number(metadata?.timerElapsedSeconds) || 0,
  };
}

export function elapsedSeconds(timer: TimerState, now: number): number {
  if (timer.status !== 'running' || !timer.startedAt) return timer.elapsedSeconds;
  const started = new Date(timer.startedAt).getTime();
  if (!Number.isFinite(started)) return timer.elapsedSeconds;
  return timer.elapsedSeconds + Math.max(0, Math.floor((now - started) / 1000));
}

export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((value) => String(value).padStart(2, '0')).join(':');
}

/** Sayaç geçişi: web start/pause/stop ile aynı metadata yaması. */
export function timerPatch(action: 'start' | 'pause' | 'stop', timer: TimerState, now: Date): Record<string, unknown> {
  if (action === 'start') return { timerStatus: 'running', timerStartedAt: now.toISOString() };
  return {
    timerStatus: action === 'pause' ? 'paused' : 'stopped',
    timerStartedAt: null,
    timerElapsedSeconds: elapsedSeconds(timer, now.getTime()),
  };
}

export function serviceFee(seconds: number, hourlyRate: number): number {
  return (seconds / 3600) * hourlyRate;
}

export function operationsTotal(operations: ServiceOperation[], currency: string): number {
  return operations
    .filter((operation) => operation.currency === currency)
    .reduce((sum, operation) => sum + operation.quantity * operation.unitPrice, 0);
}

type HistorySource = {
  ticketNo: string;
  subject: string;
  description: string | null;
  resolutionNote: string | null;
  metadata: Record<string, unknown> | null;
  company: { legalTitle: string; shortName: string | null } | null;
};

/** Web servis geçmişi araması: firma, makine, form no ve notlar. */
export function historyMatches(ticket: HistorySource, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  if (!q) return true;
  const form = ticket.metadata?.completionForm;
  const formRecord = form && typeof form === 'object' ? (form as Record<string, unknown>) : {};
  const machine = formRecord.tezgah && typeof formRecord.tezgah === 'object' ? Object.values(formRecord.tezgah as Record<string, unknown>) : [];
  const haystack = [
    ticket.ticketNo,
    ticket.subject,
    ticket.description,
    ticket.resolutionNote,
    ticket.company?.legalTitle,
    ticket.company?.shortName,
    formRecord.formNo,
    formRecord.yapilanIsler,
    ...machine,
    ...readHistory(ticket.metadata, 'noteHistory').map((note) => note.text),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLocaleLowerCase('tr-TR');
  return haystack.includes(q);
}
