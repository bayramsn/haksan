import { Checkbox } from "../../ui/checkbox";
import { Badge } from "../../ui/badge";
import { Skeleton } from "../../ui/skeleton";
import type { TaskDTO } from "../../../../lib/services";
import {
  PRIORITY_STYLE,
  STATUS_STYLE,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  dueLabel,
  isOpen,
  relatedRecord,
} from "./taskPresentation";

const DUE_TONE: Record<ReturnType<typeof dueLabel>["tone"], string> = {
  overdue: "text-destructive font-semibold",
  today: "text-warning font-semibold",
  normal: "text-foreground/80",
  none: "text-muted-foreground",
};

/**
 * Görev tablosu. Hem ana ekranda hem müşteri/lead detayındaki bölümde aynı
 * satır kullanılıyor — personel iki yerde farklı bir şey öğrenmek zorunda kalmasın.
 *
 * Satırdaki kutucuk tek tıkla tamamlar; durum değiştirmek için detaya girmek
 * gerekmiyor. Yanlışlıkla işaretlenen görev aynı kutucukla geri açılır.
 */
export function TaskList({
  tasks,
  loading,
  onOpen,
  onToggleDone,
  emptyLabel = "Görev yok.",
  compact = false,
}: {
  tasks: TaskDTO[];
  loading?: boolean;
  onOpen: (task: TaskDTO) => void;
  onToggleDone: (task: TaskDTO) => void;
  emptyLabel?: string;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-2" aria-label="Tamamla" />
            <th className="px-2 py-2 text-left">Görev</th>
            {!compact && <th className="px-2 py-2 text-left">İlgili kayıt</th>}
            <th className="px-2 py-2 text-left">Atanan</th>
            <th className="px-2 py-2 text-left">Öncelik</th>
            <th className="px-2 py-2 text-left">Durum</th>
            <th className="px-2 py-2 text-left">Son tarih</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tasks.map((task) => {
            const due = dueLabel(task);
            const related = relatedRecord(task);
            const closed = !isOpen(task);
            return (
              <tr
                key={task.id}
                className={`cursor-pointer transition hover:bg-muted/40 ${closed ? "opacity-60" : ""}`}
                onClick={() => onOpen(task)}
              >
                <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={task.status === "done"}
                    onCheckedChange={() => onToggleDone(task)}
                    aria-label={task.status === "done" ? "Görevi tekrar aç" : "Görevi tamamla"}
                  />
                </td>
                <td className="px-2 py-2">
                  <div className={`font-medium ${task.status === "done" ? "line-through" : ""}`}>{task.title}</div>
                  {compact && related && (
                    <div className="text-xs text-muted-foreground">
                      {related.kind}: {related.label}
                    </div>
                  )}
                </td>
                {!compact && (
                  <td className="px-2 py-2 text-muted-foreground">
                    {related ? (
                      <span>
                        <span className="text-[11px] uppercase tracking-wide opacity-70">{related.kind}</span>{" "}
                        {related.label}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                <td className="px-2 py-2 text-muted-foreground">{task.assignee?.fullName ?? "—"}</td>
                <td className="px-2 py-2">
                  <Badge variant="outline" className={PRIORITY_STYLE[task.priority]}>
                    {TASK_PRIORITY_LABELS[task.priority]}
                  </Badge>
                </td>
                <td className="px-2 py-2">
                  <Badge variant="outline" className={STATUS_STYLE[task.status]}>
                    {TASK_STATUS_LABELS[task.status]}
                  </Badge>
                </td>
                <td className={`whitespace-nowrap px-2 py-2 tabular-nums ${DUE_TONE[due.tone]}`}>{due.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
