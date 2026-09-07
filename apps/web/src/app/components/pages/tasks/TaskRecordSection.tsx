import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { tasksService, type TaskDTO, type TaskListParams } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskCompletionDialog } from "./TaskCompletionDialog";
import { TaskFormDialog, type TaskRelation } from "./TaskFormDialog";
import { TaskList } from "./TaskList";

/**
 * Müşteri / lead / fırsat / teklif / servis detayına gömülen görev bölümü.
 * Kullanıcı zaten o kayıtta çalıştığı için "Görev Oluştur" ilgili kaydı hazır
 * doldurur; kimse aynı müşteriyi ikinci kez seçmez.
 */
export function TaskRecordSection({
  relation,
  title = "Görevler",
  headerActions,
  onChanged,
}: {
  relation: TaskRelation;
  title?: string;
  /** Kayda özgü görev üreten ek eylemler (ör. fırsatı ileri takibe alma). */
  headerActions?: ReactNode;
  /** Üst ekran kendi geçmişini tazelemek isterse (timeline gibi). */
  onChanged?: () => void;
}) {
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission("tasks.create");
  const canRead = hasPermission("tasks.read");

  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignees, setAssignees] = useState<Array<{ id: string; fullName: string }>>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const [completing, setCompleting] = useState<TaskDTO | null>(null);
  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const params: TaskListParams = {
    companyId: relation.companyId ?? undefined,
    contactId: relation.contactId ?? undefined,
    opportunityId: relation.opportunityId ?? undefined,
    quoteId: relation.quoteId ?? undefined,
    serviceTicketId: relation.serviceTicketId ?? undefined,
    sortBy: "dueAt",
    sortDir: "asc",
    pageSize: 50,
  };
  const paramKey = JSON.stringify(params);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const list = await tasksService.list(JSON.parse(paramKey));
      setTasks(list.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görevler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [paramKey, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (canCreate) tasksService.assignees().then(setAssignees).catch(() => setAssignees([]));
  }, [canCreate]);

  const toggleDone = async (task: TaskDTO) => {
    if (task.status !== "done") {
      setCompleting(task);
      return;
    }
    try {
      await tasksService.update(task.id, { status: "todo" });
      void load();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görev güncellenemedi");
    }
  };

  if (!canRead) return null;

  const open = tasks.filter((task) => task.status === "todo" || task.status === "in_progress");

  return (
    <Card>
      <TaskCompletionDialog task={completing} onOpenChange={(open) => { if (!open) setCompleting(null); }} onCompleted={() => { void load(); onChanged?.(); }} />
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="font-display text-xl font-semibold">
          {title}
          {open.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{open.length} açık</span>}
        </CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {headerActions}
          {canCreate && (
            <Button
              size="sm"
              className="gap-1"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" /> Görev Oluştur
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <TaskList
          tasks={tasks}
          loading={loading}
          compact
          onOpen={(task) => setDetailId(task.id)}
          onToggleDone={toggleDone}
          emptyLabel="Bu kayda bağlı görev yok."
        />
      </CardContent>

      <TaskDetailPanel
        taskId={detailId}
        refreshKey={detailRevision}
        onOpenChange={(next) => !next && setDetailId(null)}
        onChanged={() => {
          void load();
          onChanged?.();
        }}
        onEdit={(task) => {
          setEditing(task);
          setFormOpen(true);
        }}
      />

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
        relation={relation}
        assignees={assignees}
        currentUserId={user?.id}
        onSaved={() => {
          setDetailRevision((revision) => revision + 1);
          void load();
          onChanged?.();
        }}
      />
    </Card>
  );
}
