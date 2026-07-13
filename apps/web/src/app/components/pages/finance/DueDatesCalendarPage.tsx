import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { financeService } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { MiniKpi } from "../../shared/MiniKpi";
import { ChevronLeft, ChevronRight, Calendar, Clock, ArrowDownLeft, ArrowUpRight } from "lucide-react";

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
            <Button size="icon" variant="outline" className="size-8" onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon" variant="outline" className="size-8" onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground mb-2">
            {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} className="min-h-[88px] rounded-md bg-muted/10" />;
              const dayItems = byDay.get(day) ?? [];
              const isToday = isCurrentMonth && day === today.getDate();
              return (
                <div
                  key={day}
                  className={`min-h-[88px] rounded-md border p-1.5 text-left ${
                    dayItems.length ? "border-warning/30 bg-warning-soft/50" : "border-border/50 bg-white"
                  } ${isToday ? "ring-2 ring-primary/30" : ""}`}
                >
                  <div className={`text-[11px] font-semibold mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>{day}</div>
                  <div className="space-y-1">
                    {dayItems.slice(0, 3).map((it) => (
                      <div key={it.id} className="rounded px-1 py-0.5 text-[10px] leading-tight bg-white border border-border/60">
                        <div className="truncate font-medium">{it.companyName}</div>
                        <div className="tabular-nums text-muted-foreground">{it.amount.toLocaleString("tr-TR")} {it.currencyCode}</div>
                        <Badge
                          variant="outline"
                          className={`mt-0.5 h-4 px-1 text-[9px] ${
                            it.type === "borc"
                              ? "border-success/20 bg-success-soft text-success"
                              : "border-warning/20 bg-warning-soft text-warning"
                          }`}
                        >
                          {it.type === "borc" ? "Tahsil" : "Ödeme"}
                        </Badge>
                      </div>
                    ))}
                    {dayItems.length > 3 && <div className="text-[9px] text-muted-foreground">+{dayItems.length - 3} daha</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
