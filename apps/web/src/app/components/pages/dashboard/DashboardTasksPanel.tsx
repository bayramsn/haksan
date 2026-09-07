import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ListTodo } from "lucide-react";
import { useAuth } from "../../../../lib/auth";
import { tasksService } from "../../../../lib/services";
import type { OperationAction } from "../../../lib/operations";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { dueLabel, relatedRecord, TASK_PRIORITY_LABELS } from "../tasks/taskPresentation";

export function DashboardTasksPanel({ onAction }: { onAction?: (action: OperationAction) => void }) {
  const { user, activeDivision, activeDepartment, hasPermission } = useAuth();
  const canRead = hasPermission("tasks.read");
  const canManage = hasPermission("tasks.manage");
  const query = useQuery({
    queryKey: ["tasks", "dashboard", user?.tenantId, user?.id, activeDivision, activeDepartment, canManage],
    enabled: Boolean(user) && canRead,
    queryFn: async () => {
      const [counts, list, summary] = await Promise.all([
        tasksService.counts(),
        tasksService.list({ view: "mine", sortBy: "dueAt", sortDir: "asc", pageSize: 5 }),
        canManage ? tasksService.summary() : Promise.resolve([]),
      ]);
      return { counts, tasks: list.data, summary };
    },
    staleTime: 30_000,
    // Görev ekranından dönüldüğünde tamamlanan işler hemen listeden düşsün.
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  if (!canRead || !user) return null;

  const navigate = (query: string) => onAction?.({ kind: "navigate", nav: "tasks", query });
  const metrics = [
    { view: "mine", label: "Bana atanan açık", count: query.data?.counts.mine },
    { view: "today", label: "Bugün", count: query.data?.counts.today },
    { view: "overdue", label: "Geciken", count: query.data?.counts.overdue },
    { view: "upcoming", label: "Yaklaşan", count: query.data?.counts.upcoming },
    { view: "all", label: "Toplam görev", count: query.data?.counts.all },
    { view: "completed", label: "Tamamlanan", count: query.data?.counts.completed },
  ];
  const teamRows = (query.data?.summary ?? [])
    .filter((row) => row.open > 0 || row.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open);

  return (
    <Card role="region" aria-label="Görev takibi">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <CardTitle className="flex items-center gap-2"><ListTodo className="size-4 text-primary" /> Görev takibi</CardTitle>
          <p className="text-xs text-muted-foreground">
            {canManage
              ? "Bugün, geciken ve yaklaşan sayıları seçili bölümde görebildiğiniz ekip görevlerini kapsar."
              : "Bugün, geciken ve yaklaşan sayıları size atanan veya sizin oluşturduğunuz görevleri kapsar."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("view:all")} disabled={!onAction}>
          Tüm görevler <ArrowUpRight className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <p role="status" className="py-6 text-sm text-muted-foreground">Görevler yükleniyor…</p>
        ) : query.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="text-sm text-destructive">Görev takibi yüklenemedi. Lütfen yeniden deneyin.</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>Yeniden dene</Button>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <div className="grid grid-cols-2 gap-2 content-start">
              {metrics.map((metric) => (
                <button
                  key={metric.view}
                  type="button"
                  aria-label={`${metric.label} ${metric.count ?? 0}`}
                  onClick={() => navigate(`view:${metric.view}`)}
                  disabled={!onAction}
                  className="rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                >
                  <span className="block text-xs text-muted-foreground">{metric.label}</span>
                  <span className={`mt-1 block text-2xl font-semibold tabular-nums ${metric.view === "overdue" && (metric.count ?? 0) > 0 ? "text-destructive" : "text-foreground"}`}>
                    {metric.count ?? 0}
                  </span>
                </button>
              ))}
            </div>
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Bana atananlar · son tarihe göre</p>
              {query.data?.tasks.length === 0 ? (
                <p className="py-5 text-sm text-muted-foreground">Size atanmış açık görev yok.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {query.data?.tasks.map((task) => {
                    const due = dueLabel(task);
                    const related = relatedRecord(task);
                    return (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`task:${task.id}`)}
                          disabled={!onAction}
                          className="flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{task.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{related ? `${related.label} · ` : ""}{TASK_PRIORITY_LABELS[task.priority]}</span>
                          </span>
                          <span className={`shrink-0 text-xs ${due.tone === "overdue" ? "font-medium text-destructive" : "text-muted-foreground"}`}>{due.text}</span>
                          <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {canManage && (
              <div className="min-w-0 border-t border-border pt-4 lg:col-span-2">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Ekip görev durumu</p>
                {teamRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Kimsenin üzerinde açık görev yok.</p>
                ) : (
                  <Table aria-label="Ekip görev durumu">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kişi</TableHead>
                        <TableHead className="text-right">Açık</TableHead>
                        <TableHead className="text-right">Gecikmiş</TableHead>
                        <TableHead className="text-right">Tamamlanan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamRows.map((row) => (
                        <TableRow key={row.userId}>
                          <TableCell className="font-medium">{row.fullName}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.open}</TableCell>
                          <TableCell className={`text-right tabular-nums ${row.overdue > 0 ? "font-semibold text-destructive" : ""}`}>{row.overdue}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.completed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
