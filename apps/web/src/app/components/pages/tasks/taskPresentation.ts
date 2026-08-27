import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
  type TaskView,
} from "@haksan/shared";
import type { TaskDTO } from "../../../../lib/services";

export { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS };

export const TASK_VIEWS: { value: TaskView; label: string }[] = [
  { value: "all", label: "Tüm Görevler" },
  { value: "mine", label: "Bana Atananlar" },
  { value: "today", label: "Bugün" },
  { value: "overdue", label: "Gecikenler" },
  { value: "upcoming", label: "Yaklaşan" },
  { value: "completed", label: "Tamamlananlar" },
];

/**
 * Öncelik rozetleri. Yalnız "Acil" dolu renk taşır; diğerleri sessiz kalır ki
 * liste bir renk cümbüşüne dönmesin ve acil iş gerçekten öne çıksın.
 */
export const PRIORITY_STYLE: Record<TaskPriority, string> = {
  urgent: "border-destructive/30 bg-destructive text-destructive-foreground",
  high: "border-warning/40 bg-warning-soft text-warning",
  normal: "border-border bg-muted text-muted-foreground",
  low: "border-border bg-transparent text-muted-foreground",
};

export const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "border-border bg-muted text-foreground/80",
  in_progress: "border-info/40 bg-info-soft text-info",
  done: "border-success/40 bg-success-soft text-success",
  cancelled: "border-border bg-transparent text-muted-foreground line-through",
};

export function isOpen(task: Pick<TaskDTO, "status">): boolean {
  return task.status === "todo" || task.status === "in_progress";
}

/**
 * Son tarihin kullanıcıya görünen hâli. Gecikme sunucudan `overdue` olarak
 * gelir; burada yalnız insan diline çevriliyor.
 */
export function dueLabel(task: Pick<TaskDTO, "dueAt" | "overdue" | "status">): {
  text: string;
  tone: "overdue" | "today" | "normal" | "none";
} {
  if (!task.dueAt) return { text: "Tarihsiz", tone: "none" };
  const due = new Date(task.dueAt);
  const time = due.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor((due.getTime() - startOfToday.getTime()) / 86_400_000);

  if (task.overdue) {
    // Gecikmeyi takvim gününden saymak yanıltıcıydı: dün 23:59'da biten görev
    // bugün 00:30'da "1 gün gecikti" diyordu. 24 saatin altında saat/dakika yaz.
    const lateMs = Date.now() - due.getTime();
    if (lateMs < 3_600_000) return { text: `${Math.max(1, Math.round(lateMs / 60_000))} dk gecikti`, tone: "overdue" };
    if (lateMs < 86_400_000) return { text: `${Math.floor(lateMs / 3_600_000)} saat gecikti`, tone: "overdue" };
    return { text: `${Math.floor(lateMs / 86_400_000)} gün gecikti`, tone: "overdue" };
  }
  if (days === 0) return { text: `Bugün ${time}`, tone: "today" };
  if (days === 1) return { text: `Yarın ${time}`, tone: "normal" };
  return {
    text: `${due.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })} ${time}`,
    tone: "normal",
  };
}

/** Görevin bağlı olduğu CRM kaydının tek satırlık adı ve tıklama hedefi. */
export function relatedRecord(task: TaskDTO): { label: string; kind: string } | null {
  if (task.company) return { label: task.company.shortName || task.company.legalTitle, kind: "Firma" };
  if (task.opportunity) return { label: task.opportunity.title, kind: "Fırsat" };
  if (task.quote) return { label: task.quote.documentNo, kind: "Teklif" };
  if (task.serviceTicket) return { label: task.serviceTicket.ticketNo, kind: "Servis" };
  if (task.contact) return { label: task.contact.fullName, kind: "Kontak" };
  return null;
}

/** `<input type="datetime-local">` biçimi (yerel saat, saniyesiz). */
export function toLocalInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
