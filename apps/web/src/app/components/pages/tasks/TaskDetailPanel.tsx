import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Pencil, RotateCcw, Trash2, XCircle } from "lucide-react";
import { tasksService, type TaskDetailDTO, type TaskDTO } from "../../../../lib/services";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Separator } from "../../ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../ui/sheet";
import { Skeleton } from "../../ui/skeleton";
import {
  PRIORITY_STYLE,
  STATUS_STYLE,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  dueLabel,
  relatedRecord,
} from "./taskPresentation";

/**
 * Sağdan açılan görev detayı. Görevi ayrı bir sayfaya taşımıyoruz: personel
 * listedeki yerini kaybetmeden görevi okuyup kapatabilmeli.
 */
export function TaskDetailPanel({
  taskId,
  onOpenChange,
  onChanged,
  onEdit,
  onNavigateToRecord,
  canDelete,
}: {
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged: (task: TaskDTO) => void;
  onEdit: (task: TaskDTO) => void;
  onNavigateToRecord?: (task: TaskDTO) => void;
  canDelete?: boolean;
}) {
  const [task, setTask] = useState<TaskDetailDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    tasksService
      .get(taskId)
      .then((data) => {
        if (!cancelled) setTask(data);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Görev yüklenemedi"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const mutate = async (patch: Parameters<typeof tasksService.update>[1], successMessage: string) => {
    if (!task) return;
    setBusy(true);
    try {
      const updated = await tasksService.update(task.id, patch);
      setTask(updated);
      onChanged(updated);
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görev güncellenemedi");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await tasksService.remove(task.id);
      toast.success("Görev silindi");
      onChanged({ ...task, status: "cancelled" });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görev silinemedi");
    } finally {
      setBusy(false);
    }
  };

  const related = task ? relatedRecord(task) : null;
  const due = task ? dueLabel(task) : null;

  return (
    <Sheet open={!!taskId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {loading || !task ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="gap-2">
              <SheetTitle className={task.status === "done" ? "line-through" : ""}>{task.title}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={STATUS_STYLE[task.status]}>
                  {TASK_STATUS_LABELS[task.status]}
                </Badge>
                <Badge variant="outline" className={PRIORITY_STYLE[task.priority]}>
                  {TASK_PRIORITY_LABELS[task.priority]}
                </Badge>
                {task.overdue && <span className="text-xs font-semibold text-destructive">Gecikti</span>}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {task.status === "done" ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate({ status: "todo" }, "Görev tekrar açıldı")}>
                  <RotateCcw className="size-4" /> Tekrar Aç
                </Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => mutate({ status: "done" }, "Görev tamamlandı")}>
                  <CheckCircle2 className="size-4" /> Tamamla
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onEdit(task)}>
                <Pencil className="size-4" /> Düzenle
              </Button>
              {task.status !== "cancelled" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => mutate({ status: "cancelled" }, "Görev iptal edildi")}
                >
                  <XCircle className="size-4" /> İptal Et
                </Button>
              )}
              {canDelete && (
                <Button size="sm" variant="destructive" disabled={busy} onClick={remove}>
                  <Trash2 className="size-4" /> Sil
                </Button>
              )}
            </div>

            <Separator />

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
              <Row label="Atanan">{task.assignee?.fullName ?? "—"}</Row>
              <Row label="Son tarih">
                <span className={task.overdue ? "font-semibold text-destructive" : ""}>{due?.text}</span>
              </Row>
              <Row label="İlgili kayıt" className="col-span-2">
                {related ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-primary hover:underline disabled:text-foreground disabled:no-underline"
                    disabled={!onNavigateToRecord}
                    onClick={() => onNavigateToRecord?.(task)}
                  >
                    <span className="text-[11px] uppercase tracking-wide opacity-70">{related.kind}</span>
                    {related.label}
                    {onNavigateToRecord && <ExternalLink className="size-3.5" />}
                  </button>
                ) : (
                  "—"
                )}
              </Row>
              {task.description && (
                <Row label="Açıklama" className="col-span-2">
                  <p className="whitespace-pre-wrap text-foreground/90">{task.description}</p>
                </Row>
              )}
              <Row label="Oluşturulma">{new Date(task.createdAt).toLocaleString("tr-TR")}</Row>
              <Row label="Tamamlanma">
                {task.completedAt ? new Date(task.completedAt).toLocaleString("tr-TR") : "—"}
              </Row>
            </dl>

            <Separator />

            <div className="p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Hareketler
              </div>
              <ol className="space-y-2 text-sm">
                {task.events.map((event) => (
                  <li key={event.id} className="flex gap-2">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-border" aria-hidden="true" />
                    <div>
                      <div>{event.summary}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString("tr-TR")}
                        {event.actor ? ` · ${event.actor.fullName}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
                {task.events.length === 0 && <li className="text-muted-foreground">Hareket yok.</li>}
              </ol>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
