import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { financeService } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { MiniKpi } from "../../shared/MiniKpi";
import { EmptyState } from "../../shared/EmptyState";
import { ChevronLeft, ChevronRight, Calendar, Clock, ArrowDownLeft, ArrowUpRight, Building2, CircleAlert } from "lucide-react";

type DueItem = {
  id: string;
  companyId: string;
  companyName: string;
  dueDate: string;
  amount: number;
  currencyCode: string;
  invoiceNo: string | null;
  type: "borc" | "alacak";
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function startWeekday(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

export function DueDatesCalendarPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("super_admin");
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [items, setItems] = useState<DueItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(() => new Date().getDate());

  const range = useMemo(() => {
    const from = new Date(cursor.year, cursor.month, 1);
    const to = new Date(cursor.year, cursor.month + 1, 0, 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [cursor]);

  useEffect(() => {
    financeService.dueDates(range).then((rows) => setItems(rows ?? [])).catch(() => setItems([]));
  }, [range.from, range.to]);

  const byDay = useMemo(() => {
    const map = new Map<number, DueItem[]>();
    for (const item of items) {
      if (item.type === "alacak" && !isAdmin) continue;
      const d = new Date(item.dueDate);
      if (d.getFullYear() !== cursor.year || d.getMonth() !== cursor.month) continue;
      const day = d.getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(item);
    }
    return map;
  }, [items, cursor, isAdmin]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  const totalDays = daysInMonth(cursor.year, cursor.month);
  const pad = startWeekday(cursor.year, cursor.month);
  const cells: (number | null)[] = [...Array(pad).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === cursor.year && today.getMonth() === cursor.month;
  const visibleItems = useMemo(
    () => items.filter((it) => !(it.type === "alacak" && !isAdmin)),
    [items, isAdmin],
  );
  const sumByCurrency = (list: DueItem[]) =>
    Object.entries(
      list.reduce<Record<string, number>>((acc, it) => {
        acc[it.currencyCode] = (acc[it.currencyCode] ?? 0) + it.amount;
        return acc;
      }, {}),
    )
      .map(([code, amount]) => `${amount.toLocaleString("tr-TR")} ${code}`)
      .join(" · ");
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const in7Days = new Date(startOfToday.getTime() + 7 * 86400000);
  const next7 = visibleItems.filter((it) => {
    const d = new Date(it.dueDate);
    return d >= startOfToday && d < in7Days;
  });
  const tahsil = visibleItems.filter((it) => it.type === "borc");
  const odeme = visibleItems.filter((it) => it.type === "alacak");
  const agendaItems = useMemo(() => {
    const source = selectedDay ? (byDay.get(selectedDay) ?? []) : next7;
    return [...source].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() || b.amount - a.amount);
  }, [selectedDay, byDay, next7]);
  const selectedTotal = sumByCurrency(agendaItems);

  const changeMonth = (direction: -1 | 1) => {
    setCursor((current) => {
      const date = new Date(current.year, current.month + direction, 1);
      const isTodayMonth = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
      setSelectedDay(isTodayMonth ? today.getDate() : null);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  };

  return (
    <div className="space-y-5">
      <div className={`grid grid-cols-2 gap-3 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <MiniKpi tone="violet" icon={<Calendar className="size-[18px]" />} label="Bu Ay Vade" value={visibleItems.length} sub={monthLabel} />
        <MiniKpi tone="amber" icon={<Clock className="size-[18px]" />} label="Önümüzdeki 7 Gün" value={next7.length} sub={sumByCurrency(next7) || "vade yok"} />
        <MiniKpi tone="emerald" icon={<ArrowDownLeft className="size-[18px]" />} label="Tahsil" value={tahsil.length} sub={sumByCurrency(tahsil) || "—"} />
        {isAdmin && (
          <MiniKpi tone="red" icon={<ArrowUpRight className="size-[18px]" />} label="Ödeme" value={odeme.length} sub={sumByCurrency(odeme) || "—"} />
        )}
      </div>
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="tracking-tight flex items-center gap-2"><Calendar className="size-5" /> Vade Takvimi</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Tahsil ve ödeme vadeleri · {monthLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="size-8" aria-label="Önceki ay" onClick={() => changeMonth(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon" variant="outline" className="size-8" aria-label="Sonraki ay" onClick={() => changeMonth(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-[10px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-[0.1em]">Gösterge</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" /> Tahsil</span>
            {isAdmin && <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" /> Ödeme</span>}
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" /> Gecikmiş</span>
            <span className="ml-auto">Bir güne tıklayarak tüm hareketleri açın</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 overflow-x-auto">
              <div className="min-w-[700px]">
                <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
                  {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="min-h-[96px] rounded-md bg-muted/10" />;
                    const dayItems = byDay.get(day) ?? [];
                    const isToday = isCurrentMonth && day === today.getDate();
                    const isSelected = selectedDay === day;
                    const hasOverdue = dayItems.some((item) => new Date(item.dueDate).getTime() < startOfToday.getTime());
                    return (
                      <button
                        type="button"
                        key={day}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedDay(day)}
                        className={`min-h-[96px] rounded-md border p-1.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          isSelected ? "border-primary/40 bg-brand-blue-soft shadow-sm ring-1 ring-primary/20" : dayItems.length ? "border-warning/25 bg-warning-soft/35 hover:border-primary/25" : "border-border/50 bg-white hover:bg-muted/25"
                        } ${isToday ? "ring-2 ring-operation-blue/25" : ""}`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-1">
                          <span className={`text-[11px] font-semibold ${isToday || isSelected ? "text-primary" : "text-muted-foreground"}`}>{day}</span>
                          {hasOverdue && <CircleAlert className="size-3 text-destructive" aria-label="Gecikmiş hareket var" />}
                        </div>
                        <div className="space-y-1">
                          {dayItems.slice(0, 2).map((it) => (
                            <div key={it.id} className="rounded border border-border/60 bg-white px-1.5 py-1 text-[10px] leading-tight shadow-xs">
                              <div className="truncate font-medium">{it.companyName}</div>
                              <div className="mt-0.5 flex items-center justify-between gap-1">
                                <span className="tabular-nums text-muted-foreground">{it.amount.toLocaleString("tr-TR")} {it.currencyCode}</span>
                                <span className={`size-1.5 rounded-full ${it.type === "borc" ? "bg-success" : "bg-warning"}`} />
                              </div>
                            </div>
                          ))}
                          {dayItems.length > 2 && <div className="rounded bg-white/80 px-1 py-0.5 text-center text-[9px] font-medium text-primary">+{dayItems.length - 2} hareket · aç</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <aside className="self-start overflow-hidden rounded-xl border border-primary/10 bg-brand-blue-soft/30 xl:sticky xl:top-3">
              <div className="border-b border-primary/10 bg-white/70 p-4">
                <div className="font-data text-[9px] font-semibold uppercase tracking-[0.15em] text-operation-blue">Günlük ajanda</div>
                <div className="mt-1 font-display text-lg font-semibold">
                  {selectedDay ? `${selectedDay} ${monthLabel}` : "Önümüzdeki 7 gün"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{agendaItems.length} hareket{selectedTotal ? ` · ${selectedTotal}` : ""}</div>
              </div>
              <div className="max-h-[520px] space-y-2 overflow-y-auto p-3">
                {agendaItems.map((item) => {
                  const overdue = new Date(item.dueDate).getTime() < startOfToday.getTime();
                  return (
                    <div key={item.id} className="rounded-lg border border-border/60 bg-white p-3 shadow-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><Building2 className="size-3" /> {item.invoiceNo || "Cari hareket"}</div>
                          <div className="mt-1 truncate text-sm font-semibold">{item.companyName}</div>
                        </div>
                        <Badge variant="outline" className={`h-5 shrink-0 text-[9px] ${overdue ? "border-destructive/20 bg-destructive-soft text-destructive" : item.type === "borc" ? "border-success/20 bg-success-soft text-success" : "border-warning/20 bg-warning-soft text-warning"}`}>
                          {overdue ? "Gecikmiş" : item.type === "borc" ? "Tahsil" : "Ödeme"}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-2 border-t border-dashed border-border pt-2">
                        <span className="text-[10px] text-muted-foreground">{new Date(item.dueDate).toLocaleDateString("tr-TR")}</span>
                        <span className="font-data text-sm font-semibold tabular-nums">{item.amount.toLocaleString("tr-TR")} {item.currencyCode}</span>
                      </div>
                    </div>
                  );
                })}
                {agendaItems.length === 0 && <EmptyState scene="calendar" title="Bu gün için vade yok" description="Başka bir gün seçin veya ay görünümünden planı inceleyin." compact />}
              </div>
            </aside>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
