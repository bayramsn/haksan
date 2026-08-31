import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Filter, Plus, Search, Users } from "lucide-react";
import { TASK_PRIORITIES, TASK_STATUSES } from "@haksan/shared";
import type { TaskPriority, TaskStatus, TaskView } from "@haksan/shared";
import {
  tasksService,
  type TaskCounts,
  type TaskDTO,
  type TaskListParams,
  type TaskUserSummary,
} from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent } from "../../ui/card";
import { Input } from "../../ui/input";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskFormDialog } from "./TaskFormDialog";
import { TaskList } from "./TaskList";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_VIEWS } from "./taskPresentation";

const EMPTY_BY_VIEW: Record<TaskView, string> = {
  all: "Henüz görev yok. Sağ üstten ilk görevi oluşturun.",
  mine: "Size atanmış açık görev yok.",
  today: "Bugün için görev yok.",
  overdue: "Geciken görev yok.",
  upcoming: "Yaklaşan görev yok.",
  completed: "Tamamlanmış görev yok.",
  history: "Henüz tamamlanan veya iptal edilen görev yok.",
};

export function TasksPage({
  onOpenRecord,
  initialQuery,
}: {
  onOpenRecord?: (task: TaskDTO) => void;
  /** Bildirimden gelen hedef: "task:<id>" ilgili görevin detayını açar. */
  initialQuery?: string;
}) {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("tasks.manage");
  const canDelete = hasPermission("tasks.delete");

  const [view, setView] = useState<TaskView>("mine");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [sortBy, setSortBy] = useState<NonNullable<TaskListParams["sortBy"]>>("dueAt");
  const [showFilters, setShowFilters] = useState(false);

  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [counts, setCounts] = useState<TaskCounts | null>(null);
  const [summary, setSummary] = useState<TaskUserSummary[]>([]);
  const [assignees, setAssignees] = useState<Array<{ id: string; fullName: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Görev atama bildirimi listeyi değil doğrudan görevi açmalı.
  useEffect(() => {
    if (!initialQuery?.startsWith("task:")) return;
    const taskId = initialQuery.slice("task:".length).trim();
    if (taskId) setDetailId(taskId);
  }, [initialQuery]);
  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Arama her tuşta istek atmasın; kullanıcı yazmayı bitirince sorgulanır.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, freshCounts] = await Promise.all([
        tasksService.list({
          view,
          search: debouncedSearch || undefined,
          status: status || undefined,
          priority: priority || undefined,
          assignedToUserId: assignedToUserId || undefined,
          createdBy: createdBy || undefined,
          sortBy,
          sortDir: sortBy === "createdAt" ? "desc" : "asc",
          pageSize: 100,
        }),
        tasksService.counts(),
      ]);
      setTasks(list.data);
      setCounts(freshCounts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görevler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [view, debouncedSearch, status, priority, assignedToUserId, createdBy, sortBy]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    tasksService.assignees().then(setAssignees).catch(() => setAssignees([]));
    if (canManage) tasksService.summary().then(setSummary).catch(() => setSummary([]));
  }, [canManage]);

  /** Kutucukla tamamla/geri aç. Liste hemen güncellenir, sayımlar arkadan tazelenir. */
  const toggleDone = async (task: TaskDTO) => {
    const next: TaskStatus = task.status === "done" ? "todo" : "done";
    setTasks((prev) => prev.map((row) => (row.id === task.id ? { ...row, status: next } : row)));
    try {
      const updated = await tasksService.update(task.id, { status: next });
      setTasks((prev) => prev.map((row) => (row.id === task.id ? updated : row)));
      setCounts(await tasksService.counts());
    } catch (error) {
      setTasks((prev) => prev.map((row) => (row.id === task.id ? task : row)));
      toast.error(error instanceof Error ? error.message : "Görev güncellenemedi");
    }
  };

  const applyChanged = (task: TaskDTO) => {
    setTasks((prev) => prev.map((row) => (row.id === task.id ? task : row)));
    void load();
  };

  const activeFilterCount = [status, priority, assignedToUserId, createdBy].filter(Boolean).length;

  const countFor = (key: TaskView) => counts?.[key] ?? 0;

  const viewTabs = useMemo(
    () =>
      TASK_VIEWS.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => setView(item.value)}
          className={`flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
            view === item.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card hover:bg-muted/50"
          }`}
        >
          {item.label}
          <span
            className={`rounded px-1.5 text-xs tabular-nums ${
              view === item.value ? "bg-white/20" : "bg-muted text-muted-foreground"
            } ${item.value === "overdue" && countFor("overdue") > 0 && view !== item.value ? "!bg-destructive-soft !text-destructive" : ""}`}
          >
            {countFor(item.value)}
          </span>
        </button>
      )),
    [view, counts]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">{viewTabs}</div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Görev, müşteri, firma, lead veya teklif ara…"
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowFilters((prev) => !prev)}
            aria-expanded={showFilters}
          >
            <Filter className="size-4" /> Filtreler
            {activeFilterCount > 0 && <Badge variant="outline">{activeFilterCount}</Badge>}
          </Button>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as NonNullable<TaskListParams["sortBy"]>)}
            aria-label="Sıralama"
          >
            <option value="dueAt">Son tarihe göre</option>
            <option value="priority">Önceliğe göre</option>
            <option value="createdAt">Oluşturulmaya göre</option>
            <option value="status">Duruma göre</option>
          </select>
          <Button
            className="gap-2"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Yeni Görev
          </Button>

          {showFilters && (
            <div className="grid w-full gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <FilterSelect label="Durum" value={status} onChange={(value) => setStatus(value as TaskStatus | "")}>
                <option value="">Tümü</option>
                {TASK_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {TASK_STATUS_LABELS[value]}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Öncelik"
                value={priority}
                onChange={(value) => setPriority(value as TaskPriority | "")}
              >
                <option value="">Tümü</option>
                {TASK_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {TASK_PRIORITY_LABELS[value]}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Atanan" value={assignedToUserId} onChange={setAssignedToUserId}>
                <option value="">Tümü</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Oluşturan" value={createdBy} onChange={setCreatedBy}>
                <option value="">Tümü</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                  </option>
                ))}
              </FilterSelect>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && summary.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="size-3.5" /> Ekip görev durumu
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.map((row) => (
                <button
                  key={row.userId}
                  type="button"
                  onClick={() => {
                    setAssignedToUserId(row.userId);
                    setView("all");
                    setShowFilters(true);
                  }}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition hover:bg-muted/50"
                >
                  <div className="font-medium">{row.fullName}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.open} açık
                    {row.overdue > 0 && <span className="font-semibold text-destructive"> · {row.overdue} geciken</span>}
                    {` · ${row.completed} tamamlanan`}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <TaskList
            tasks={tasks}
            loading={loading}
            onOpen={(task) => setDetailId(task.id)}
            onToggleDone={toggleDone}
            emptyLabel={EMPTY_BY_VIEW[view]}
          />
        </CardContent>
      </Card>

      <TaskDetailPanel
        taskId={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        onChanged={applyChanged}
        onEdit={(task) => {
          setEditing(task);
          setFormOpen(true);
        }}
        onNavigateToRecord={onOpenRecord}
        canDelete={canDelete}
      />

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
        assignees={assignees}
        currentUserId={user?.id}
        onSaved={() => void load()}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
