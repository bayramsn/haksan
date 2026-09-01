import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { TaskStatus } from "@haksan/shared";
import { tasksService, type TaskDTO, type TaskListParams } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { WorkspaceSection, useSectionOpen } from "../../shared/RecordWorkspace";
import { TaskDetailPanel } from "./TaskDetailPanel";
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
  collapsible = false,
}: {
  relation: TaskRelation;
  title?: string;
  /** Kayda özgü görev üreten ek eylemler (ör. fırsatı ileri takibe alma). */
  headerActions?: ReactNode;
  /** Üst ekran kendi geçmişini tazelemek isterse (timeline gibi). */
  onChanged?: () => void;
  /**
   * Kalabalık çalışma alanlarında bölüm katlanır: açık görev yokken kapalı
   * başlar, başlık satırı sayıyı yine de gösterir. Diğer ekranlar (müşteri,
   * teklif, servis) varsayılan açık kartı kullanmaya devam eder.
   */
  collapsible?: boolean;
}) {
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission("tasks.create");
  const canRead = hasPermission("tasks.read");

  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignees, setAssignees] = useState<Array<{ id: string; fullName: string }>>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
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
    const next: TaskStatus = task.status === "done" ? "todo" : "done";
    setTasks((prev) => prev.map((row) => (row.id === task.id ? { ...row, status: next } : row)));
    try {
      const updated = await tasksService.update(task.id, { status: next });
      setTasks((prev) => prev.map((row) => (row.id === task.id ? updated : row)));
      onChanged?.();
    } catch (error) {
      setTasks((prev) => prev.map((row) => (row.id === task.id ? task : row)));
      toast.error(error instanceof Error ? error.message : "Görev güncellenemedi");
    }
  };

  const open = tasks.filter((task) => task.status === "todo" || task.status === "in_progress");
  // Kanca `if (!canRead) return null;` erken dönüşünün ÜSTÜNDE: altında
  // kalırsa yetki değiştiğinde kanca sayısı değişir.
  const sectionOpen = useSectionOpen(open.length > 0, paramKey);

  if (!canRead) return null;

  const actions = (
    <>
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
    </>
  );

  const list = (
    <TaskList
      tasks={tasks}
      loading={loading}
      compact
      onOpen={(task) => setDetailId(task.id)}
      onToggleDone={toggleDone}
      emptyLabel="Bu kayda bağlı görev yok."
    />
  );

  const dialogs = (
    <>
      <TaskDetailPanel
        taskId={detailId}
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
          void load();
          onChanged?.();
        }}
      />
    </>
  );

  if (collapsible) {
    return (
      <WorkspaceSection
        title={title}
        // Kapalıyken de "yapılacak bir şey var mı" sorusunu yanıtlar.
        status={open.length > 0 ? `${open.length} açık görev` : loading ? "Yükleniyor…" : "Açık görev yok"}
        actions={actions}
        open={sectionOpen}
      >
        {list}
        {dialogs}
      </WorkspaceSection>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="font-display text-xl font-semibold">
          {title}
          {open.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{open.length} açık</span>}
        </CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      </CardHeader>
      <CardContent className="p-0">{list}</CardContent>

      {dialogs}
    </Card>
  );
}
