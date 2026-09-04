import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ListTodo } from "lucide-react";
import { tasksService, type TaskCounts, type TaskUserSummary } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { Badge } from "../../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";

/** Panonun üst şeridindeki dört sayaç. */
const TILES = [
  { key: "all", label: "Toplam görev", icon: ListTodo, tone: "text-primary" },
  { key: "today", label: "Bugün biten", icon: CalendarClock, tone: "text-warning" },
  { key: "overdue", label: "Gecikmiş", icon: AlertTriangle, tone: "text-destructive" },
  { key: "completed", label: "Tamamlanan", icon: CheckCircle2, tone: "text-success" },
] as const satisfies ReadonlyArray<{ key: keyof TaskCounts; label: string; icon: typeof ListTodo; tone: string }>;

/**
 * Gösterge panelindeki görev kartı. Sayaçlar `tasks.read` ile herkese, kişi
 * kırılımı yalnız `tasks.manage` olanlara gösterilir — uçların yetki kapısı da
 * aynı ayrımı yapıyor, yetkisiz kullanıcıya boş tablo göstermek yerine bölüm hiç
 * çizilmiyor.
 */
export function DashboardTasksPanel() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("tasks.read");
  const canManage = hasPermission("tasks.manage");
  const [counts, setCounts] = useState<TaskCounts | null>(null);
  const [summary, setSummary] = useState<TaskUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([tasksService.counts(), canManage ? tasksService.summary() : Promise.resolve([])])
      .then(([countsResult, summaryResult]) => {
        if (!alive) return;
        setCounts(countsResult);
        setSummary(summaryResult);
      })
      .catch((err: any) => {
        if (alive) setError(err?.message ?? "Görev özeti yüklenemedi.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [canRead, canManage]);

  if (!canRead) return null;

  // Hareketsiz kullanıcılar tabloyu şişirmesin; yükü olan kişiler önce gelsin.
  const rows = summary
    .filter((row) => row.open > 0 || row.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListTodo className="size-4 text-primary" /> Görevler
        </CardTitle>
        {counts && counts.overdue > 0 && (
          <Badge variant="destructive">{counts.overdue} gecikmiş</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Yükleniyor…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !counts ? (
          <p className="text-sm text-muted-foreground">Görev verisi yok.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TILES.map((tile) => (
                <div key={tile.key} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <tile.icon className={`size-3.5 ${tile.tone}`} /> {tile.label}
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{counts[tile.key]}</div>
                </div>
              ))}
            </div>

            {canManage &&
              (rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Kimsenin üzerinde açık görev yok.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kişi</TableHead>
                        <TableHead className="text-right">Açık</TableHead>
                        <TableHead className="text-right">Gecikmiş</TableHead>
                        <TableHead className="text-right">Tamamlanan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.userId}>
                          <TableCell className="font-medium">{row.fullName}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.open}</TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${row.overdue > 0 ? "font-semibold text-destructive" : ""}`}
                          >
                            {row.overdue}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.completed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
